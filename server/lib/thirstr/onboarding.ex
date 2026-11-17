defmodule Thirstr.Onboarding do
  @moduledoc """
  F-02 Onboarding state machine: basics → location → photo → verify → done.
  Spec: docs/spec/features/F02-onboarding.md. The server keeps the step so a killed
  app resumes at the last incomplete step.
  """
  import Ecto.Query
  alias Thirstr.{Accounts, Repo, Storage}
  alias Thirstr.Accounts.Account
  alias Thirstr.Moderation.Classifier
  alias Thirstr.Profiles.{Photo, Profile}

  @next %{"basics" => "location", "location" => "photo", "photo" => "verify", "verify" => "done"}

  def main_profile(%Account{id: id}),
    do:
      Repo.one(
        from p in Profile,
          where: p.account_id == ^id and p.kind == "now",
          preload: [photos: ^from(ph in Photo, order_by: ph.slot)]
      )

  # ------------------------------------------------------------- S-03 Basics

  @doc "R-02.3: under 18 → account deleted, install flagged 30 d."
  def save_basics(%Account{} = a, attrs, install_key) do
    with {:ok, birthdate} <- parse_date(attrs["birthdate"]),
         age = age_on(birthdate, Date.utc_today()),
         :ok <- check_age(a, age, install_key) do
      Repo.transaction(fn -> write_basics(a, attrs, age, birthdate) end)
    end
  end

  defp check_age(a, age, install_key) when age < 18 do
    Accounts.delete_account(a)
    if install_key, do: Accounts.flag_underage_device(install_key)
    {:error, :underage}
  end

  defp check_age(_a, age, _key) when age > 99,
    do: {:error, {:validation, %{birthdate: ["is not valid"]}}}

  defp check_age(_a, _age, _key), do: :ok

  defp write_basics(a, attrs, age, birthdate) do
    profile = main_profile(a) || %Profile{account_id: a.id, kind: "now"}
    changeset = profile |> Profile.basics_changeset(attrs) |> Ecto.Changeset.put_change(:age, age)

    with {:ok, p} <- Repo.insert_or_update(changeset),
         {:ok, a} <- a |> Account.changeset(%{birthdate: birthdate}) |> Repo.update() do
      {advance!(a, "basics"), p}
    else
      {:error, cs} -> Repo.rollback({:validation, errors(cs)})
    end
  end

  def age_on(birthdate, today) do
    years = today.year - birthdate.year
    if {today.month, today.day} < {birthdate.month, birthdate.day}, do: years - 1, else: years
  end

  # ------------------------------------------------------------- S-04 Location

  @doc "R-02.6 / F-05: level chosen here; Hidden only once verified. Client sends H3 cells, never lat/lng."
  def set_location(%Account{} = a, params) do
    with %Profile{} = p <- main_profile(a) || {:error, :basics_required},
         {:ok, _} <- Thirstr.Location.put(a, p, params) do
      {:ok, advance!(a, "location")}
    end
  end

  # ------------------------------------------------------------- S-05 Photo

  def create_photo_upload(%Account{} = a, slot, content_type) do
    with %Profile{} = p <- main_profile(a) || {:error, :basics_required},
         true <- slot in 0..4 || {:error, {:validation, %{slot: ["must be 0..4"]}}},
         true <-
           content_type in ~w(image/jpeg image/png image/heic image/webp) ||
             {:error, {:validation, %{content_type: ["unsupported"]}}} do
      key = "public/#{Ecto.UUID.generate()}"
      photo = Repo.insert!(%Photo{profile_id: p.id, slot: slot, storage_key: key})
      {:ok, put_url} = Storage.presigned_put(key, content_type)
      {:ok, photo, put_url}
    end
  end

  @doc "R-02.7: classify after upload; inline result. Main photo (slot 0) must be :ok_main."
  def check_photo(%Account{} = a, photo_id) do
    with %Profile{} = p <- main_profile(a) || {:error, :not_found},
         %Photo{} = ph <-
           Repo.get_by(Photo, id: photo_id, profile_id: p.id) || {:error, :not_found},
         {:ok, %{size: size}} when size > 0 and size <= 15_000_000 <- Storage.head(ph.storage_key) do
      {status, reason, score} =
        case Classifier.impl().classify(ph.storage_key, ph.slot) do
          {ok, score} -> {Atom.to_string(ok), nil, score}
          {:rejected, why, score} -> {"rejected", Atom.to_string(why), score}
        end

      ph =
        ph
        |> Ecto.Changeset.change(status: status, reject_reason: reason, classifier_score: score)
        |> Repo.update!()

      if status in ~w(ok_main ok_public), do: replace_slot(p, ph)

      a = if ph.slot == 0 and status == "ok_main", do: advance!(a, "photo"), else: a
      {:ok, ph, a}
    else
      {:ok, %{size: _}} -> {:error, {:validation, %{photo: ["missing or too large"]}}}
      {:error, :not_found} -> {:error, :not_found}
      other -> other
    end
  end

  defp replace_slot(%Profile{} = p, %Photo{} = ph) do
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

    ordered =
      Repo.all(
        from x in Photo,
          where: x.profile_id == ^p.id and x.status in ["ok_main", "ok_public"],
          order_by: x.slot,
          select: x.id
      )

    Repo.update_all(from(x in Profile, where: x.id == ^p.id), set: [photo_ids: ordered])
  end

  # ------------------------------------------------------------- S-06 Verify

  @doc "R-02.8: Later → browse-only on Explore. Verification itself is F-03."
  def verify_later(%Account{onboarding_step: "verify"} = a), do: {:ok, advance!(a, "verify")}

  def verify_later(%Account{} = a),
    do: {:error, {:conflict, "onboarding step is #{a.onboarding_step}"}}

  # ------------------------------------------------------------- helpers

  defp advance!(%Account{onboarding_step: step} = a, step) do
    a |> Ecto.Changeset.change(onboarding_step: @next[step]) |> Repo.update!()
  end

  defp advance!(a, _), do: a

  defp parse_date(s) when is_binary(s) do
    case Date.from_iso8601(s) do
      {:ok, d} -> {:ok, d}
      _ -> {:error, {:validation, %{birthdate: ["must be YYYY-MM-DD"]}}}
    end
  end

  defp parse_date(_), do: {:error, {:validation, %{birthdate: ["can't be blank"]}}}

  def errors(%Ecto.Changeset{} = cs) do
    Ecto.Changeset.traverse_errors(cs, fn {msg, opts} ->
      Enum.reduce(opts, msg, fn {k, v}, acc -> String.replace(acc, "%{#{k}}", to_string(v)) end)
    end)
  end
end
