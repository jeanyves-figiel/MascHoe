defmodule Thirstr.Profiles do
  @moduledoc """
  F-06 Profiles: up to 3 per account (now, sport, friends), field catalogue with per-field
  visibility, photos (5 public slots), completeness. Spec: docs/spec/features/F06-profiles.md.
  The account id is never returned; profiles of one account are unlinkable (R-06.1, AC-06.3).
  """
  import Ecto.Query
  alias Thirstr.{Repo, Storage}
  alias Thirstr.Accounts.Account
  alias Thirstr.Moderation.{Classifier, Text}
  alias Thirstr.Profiles.{Fields, Photo, Profile}

  @photos_q from(ph in Photo, order_by: [ph.slot, desc: ph.inserted_at])

  def list_own(%Account{id: id}) do
    Repo.all(
      from p in Profile,
        where: p.account_id == ^id,
        order_by: fragment("array_position(ARRAY['now','sport','friends'], ?)", p.kind),
        preload: [photos: ^@photos_q]
    )
  end

  def get_own(%Account{id: aid}, id) do
    with {:ok, _} <- Ecto.UUID.cast(id),
         %Profile{} = p <-
           Repo.one(
             from p in Profile,
               where: p.id == ^id and p.account_id == ^aid,
               preload: [photos: ^@photos_q]
           ) do
      {:ok, p}
    else
      _ -> {:error, :not_found}
    end
  end

  def get_by_kind(%Account{id: aid}, kind) do
    Repo.one(
      from p in Profile,
        where: p.account_id == ^aid and p.kind == ^kind,
        preload: [photos: ^@photos_q]
    )
  end

  @doc "R-06.1 / R-11.1: Sport and Friends profiles are created lazily, copying identity basics."
  def create(%Account{} = a, kind) when kind in ~w(sport friends) do
    case get_by_kind(a, "now") do
      nil ->
        {:error, :basics_required}

      now ->
        if get_by_kind(a, kind), do: throw(:exists)

        %Profile{
          account_id: a.id,
          kind: kind,
          display_name: now.display_name,
          age: now.age,
          gender: now.gender,
          gender_other: now.gender_other,
          here_for: if(kind == "sport", do: ["sport"], else: ["friends"]),
          fields: %{}
        }
        |> Repo.insert()
        |> case do
          {:ok, p} -> copy_location(a, p) && get_own(a, p.id)
          other -> other
        end
    end
  catch
    :exists -> {:error, {:conflict, "You already have this profile"}}
  end

  def create(_, _), do: {:error, {:validation, %{kind: ["must be sport or friends"]}}}

  defp copy_location(a, p) do
    Repo.query!(
      """
      INSERT INTO location_cells (profile_id, level, cell_r9, cell_r8, cell_r7, cell_r5, hide_from_hidden, display_res, updated_at)
      SELECT $1, lc.level, lc.cell_r9, lc.cell_r8, lc.cell_r7, lc.cell_r5, lc.hide_from_hidden, lc.display_res, now()
      FROM location_cells lc JOIN profiles p ON p.id = lc.profile_id
      WHERE p.account_id = $2 AND p.kind = 'now'
      ON CONFLICT DO NOTHING
      """,
      [Ecto.UUID.dump!(p.id), Ecto.UUID.dump!(a.id)]
    )

    true
  end

  def delete(%Account{} = a, id) do
    with {:ok, p} <- get_own(a, id),
         true <- p.kind != "now" || {:error, {:conflict, "Your main profile can't be deleted"}} do
      keys = Enum.map(p.photos, & &1.storage_key)
      Repo.delete!(p)
      Storage.delete_many(keys)
      :ok
    end
  end

  @doc "PATCH /me/profiles/:id: display_name, here_for, fields, visibility_map (R-06.4, R-06.12)."
  def update(%Account{} = a, id, params) do
    with {:ok, p} <- get_own(a, id),
         {:ok, fields, vis} <-
           Fields.apply(
             p.kind,
             p.fields,
             p.visibility_map,
             params["fields"],
             params["visibility_map"]
           ),
         :ok <- check_texts(a, fields) do
      basics = Map.take(params, ~w(display_name here_for gender gender_other))

      p
      |> Profile.basics_changeset(
        Map.merge(
          %{"display_name" => p.display_name, "gender" => p.gender, "here_for" => p.here_for},
          basics
        )
      )
      |> Ecto.Changeset.put_change(:fields, fields)
      |> Ecto.Changeset.put_change(:visibility_map, vis)
      |> Ecto.Changeset.put_change(:public_updated_at, fuzzed_now())
      |> Ecto.Changeset.put_change(
        :completeness,
        Fields.completeness(%{fields: fields, photo_ids: p.photo_ids, kind: p.kind})
      )
      |> Repo.update()
      |> case do
        {:ok, p} ->
          if Map.has_key?(basics, "display_name"), do: sync_name(a, p)
          broadcast_change(p)
          get_own(a, p.id)

        other ->
          other
      end
    end
  end

  # Name/gender are identity: kept equal across own profiles.
  defp sync_name(a, p) do
    Repo.update_all(from(x in Profile, where: x.account_id == ^a.id and x.id != ^p.id),
      set: [display_name: p.display_name, gender: p.gender, gender_other: p.gender_other]
    )
  end

  defp check_texts(a, fields) do
    links_ok? =
      Account.verified?(a) and
        DateTime.diff(DateTime.utc_now(), a.inserted_at, :hour) >= 24

    Enum.reduce_while(~w(bio prompt_a boundaries), :ok, fn k, :ok ->
      case Text.check_bio(fields[k], links_ok?) do
        :ok -> {:cont, :ok}
        {:error, msg} -> {:halt, {:error, {:validation, %{k => [msg]}}}}
      end
    end)
  end

  # AC-06.3: updates of two profiles of one account can't be correlated by timestamp.
  defp fuzzed_now,
    do: DateTime.add(DateTime.utc_now(), :rand.uniform(1200) - 600, :second)

  defp broadcast_change(p),
    do: Phoenix.PubSub.broadcast(Thirstr.PubSub, "profile:" <> p.id, {:profile_changed, p.id})

  # ------------------------------------------------------------- photos (R-06.3, F-08 R-08.1)

  @types ~w(image/jpeg image/png image/heic image/webp image/avif)

  def create_photo_upload(%Account{} = a, profile_id, slot, content_type) do
    with {:ok, p} <- get_own(a, profile_id),
         true <- slot in 0..4 || {:error, {:validation, %{slot: ["must be 0..4"]}}},
         true <-
           content_type in @types || {:error, {:validation, %{content_type: ["unsupported"]}}} do
      key = "public/#{Ecto.UUID.generate()}"
      photo = Repo.insert!(%Photo{profile_id: p.id, slot: slot, storage_key: key})
      {:ok, put_url} = Storage.presigned_put(key, content_type)
      {:ok, photo, put_url}
    end
  end

  @doc """
  R-02.7 / R-15.10: classify after upload. Slot 0 must be `ok_main`; Sport profile is strict
  on every slot (AC-11.1). Borderline → `pending` + review queue, hidden until reviewed.
  """
  def check_photo(%Account{} = a, profile_id, photo_id) do
    with {:ok, p} <- get_own(a, profile_id),
         %Photo{} = ph <-
           Repo.get_by(Photo, id: photo_id, profile_id: p.id) || {:error, :not_found},
         {:ok, %{size: size}} when size > 0 and size <= 15_000_000 <- Storage.head(ph.storage_key) do
      {status, reason, score} =
        case Classifier.impl().classify(ph.storage_key, ph.slot, p.kind) do
          {:review, score} -> {"pending", nil, score}
          {ok, score} when ok in [:ok_main, :ok_public] -> {Atom.to_string(ok), nil, score}
          {:rejected, why, score} -> {"rejected", Atom.to_string(why), score}
        end

      ph =
        ph
        |> Ecto.Changeset.change(
          status: status,
          reject_reason: reason,
          classifier_score: score,
          review_state: if(status == "pending", do: "queued")
        )
        |> Repo.update!()

      if status in ~w(ok_main ok_public), do: replace_slot(p, ph)
      {:ok, ph, p}
    else
      {:ok, %{size: _}} -> {:error, {:validation, %{photo: ["missing or too large"]}}}
      {:error, _} = e -> e
      nil -> {:error, :not_found}
    end
  end

  @doc "Moves a checked photo into its slot, dropping whatever was there before."
  def replace_slot(%Profile{} = p, %Photo{} = ph) do
    others =
      Repo.all(
        from x in Photo,
          where: x.profile_id == ^p.id and x.slot == ^ph.slot and x.id != ^ph.id,
          select: x.storage_key
      )

    Repo.delete_all(
      from x in Photo, where: x.profile_id == ^p.id and x.slot == ^ph.slot and x.id != ^ph.id
    )

    Storage.delete_many(others)
    refresh_photo_ids(p.id)
  end

  def refresh_photo_ids(profile_id) do
    ordered =
      Repo.all(
        from x in Photo,
          where: x.profile_id == ^profile_id and x.status in ["ok_main", "ok_public"],
          order_by: x.slot,
          select: x.id
      )

    p = Repo.get!(Profile, profile_id)

    Repo.update_all(from(x in Profile, where: x.id == ^profile_id),
      set: [
        photo_ids: ordered,
        completeness: Fields.completeness(%{fields: p.fields, photo_ids: ordered, kind: p.kind})
      ]
    )
  end

  def delete_photo(%Account{} = a, profile_id, photo_id) do
    with {:ok, p} <- get_own(a, profile_id),
         %Photo{} = ph <- Enum.find(p.photos, &(&1.id == photo_id)) || {:error, :not_found},
         true <-
           ph.slot != 0 || length(p.photos) == 1 ||
             {:error, {:conflict, "Replace your main photo instead"}} do
      Repo.delete!(ph)
      Storage.delete_many([ph.storage_key])
      refresh_photo_ids(p.id)
      get_own(a, p.id)
    end
  end

  @doc "PUT /me/profiles/:id/photos/order — new order of photo ids; slot 0 must be ok_main (R-06.3)."
  def reorder_photos(%Account{} = a, profile_id, ids) when is_list(ids) do
    with {:ok, p} <- get_own(a, profile_id) do
      live = Enum.filter(p.photos, &(&1.status in ~w(ok_main ok_public)))
      by_id = Map.new(live, &{&1.id, &1})

      cond do
        Enum.sort(ids) != Enum.sort(Map.keys(by_id)) ->
          {:error, {:validation, %{order: ["must list every photo once"]}}}

        ids != [] and by_id[hd(ids)].status != "ok_main" and
            not main_ok?(by_id[hd(ids)], p.kind) ->
          {:error, {:validation, %{order: ["your main photo must pass the main-photo check"]}}}

        true ->
          Repo.transaction(fn ->
            # two-step to avoid transient duplicates
            Enum.each(ids, fn id ->
              Repo.update_all(from(x in Photo, where: x.id == ^id), inc: [slot: 100])
            end)

            ids
            |> Enum.with_index()
            |> Enum.each(fn {id, i} ->
              Repo.update_all(from(x in Photo, where: x.id == ^id), set: [slot: i])
            end)
          end)

          refresh_photo_ids(p.id)
          get_own(a, p.id)
      end
    end
  end

  def reorder_photos(_, _, _), do: {:error, {:validation, %{order: ["must be a list"]}}}

  # A public photo can become main only if its score meets the main threshold.
  defp main_ok?(%Photo{classifier_score: s}, _kind),
    do: Map.get(s || %{}, "main_ok", false) == true

  # ------------------------------------------------------------- visibility helpers

  def visible_main_photo?(%Profile{photo_ids: [_ | _]}), do: true
  def visible_main_photo?(%Profile{seeded: true}), do: true
  def visible_main_photo?(_), do: false
end
