defmodule Thirstr.Venues do
  @moduledoc """
  F-12 venues & check-in. Only current check-ins exist: rows are deleted at check-out, there is
  no history (AC-12.2). Only people checked in **and** visible see each other (R-12.3), and the
  "here" list needs the caller to be checked in (AC-12.1).
  """
  alias Thirstr.{Nearby, Profiles, Repo, Social}

  import Thirstr.Tonight, only: [check: 3]

  @kinds %{
    "hookup" => ~w(sauna bar club other),
    "friends" => ~w(bar club other),
    "sport" => ~w(gym)
  }
  @max_hours 4
  @near_checkin_m 1500

  @doc "GET /venues/nearby?mode — venues for the mode (R-12.7)."
  def nearby(ctx) do
    if is_nil(ctx.point) do
      {:ok, %{venues: [], checkin: my_checkin(ctx)}}
    else
      venues =
        Repo.query!(
          """
          SELECT v.id::text, v.name, v.kind, v.cell_r9, v.geofence_radius_m,
                 (SELECT count(*) FROM venue_checkins c WHERE c.venue_id = v.id)
          FROM venues v WHERE v.cell_r5 = ANY($1) AND v.kind = ANY($2)
          """,
          [Nearby.area(ctx, 2), Map.get(@kinds, ctx.mode, @kinds["hookup"])]
        ).rows
        |> Nearby.utc()
        |> Nearby.utc()
        |> Enum.map(fn [id, name, kind, cell, r, n] ->
          d = Nearby.dist_m(ctx, cell)

          %{
            id: id,
            name: name,
            kind: kind,
            geofence_radius_m: r,
            here: count_label(n),
            area_cell: Integer.to_string(cell, 16) |> String.downcase(),
            distance: Nearby.bucket(d),
            dist: d
          }
        end)
        |> Enum.sort_by(& &1.dist)
        |> Enum.map(&Map.delete(&1, :dist))

      {:ok, %{venues: venues, checkin: my_checkin(ctx)}}
    end
  end

  # R-12.5: counts under 5 are shown as "a few".
  defp count_label(0), do: "0"
  defp count_label(n) when n < 5, do: "a_few"
  defp count_label(n), do: Integer.to_string(n)

  defp my_checkin(ctx) do
    case Repo.query!(
           """
           SELECT c.venue_id::text, v.name, c.visible, c.zone, c.checked_in_at, c.auto_out_at
           FROM venue_checkins c JOIN venues v ON v.id = c.venue_id
           WHERE c.profile_id = ANY($1) AND c.auto_out_at > now()
           """,
           [Enum.map(ctx.own_ids, &Nearby.dump/1)]
         ).rows do
      [[vid, name, vis, zone, at, out] | _] ->
        %{
          venue_id: vid,
          name: name,
          visible: vis,
          zone: zone,
          checked_in_at: at,
          auto_out_at: out
        }

      _ ->
        nil
    end
  end

  defp venue(id) do
    with {:ok, _} <- Ecto.UUID.cast(id),
         [[name, kind, cell, r]] <-
           Repo.query!(
             "SELECT name, kind, cell_r9, geofence_radius_m FROM venues WHERE id = $1",
             [Nearby.dump(id)]
           ).rows do
      {:ok, %{id: id, name: name, kind: kind, cell: cell, radius: r}}
    else
      _ -> {:error, :not_found}
    end
  end

  @doc "POST /venues/:id/checkin {visible, zone} — verified, not in Safe Mode (R-12.2, R-12.8)."
  def checkin(ctx, id, params) do
    zone = params["zone"] && String.slice(String.trim(to_string(params["zone"])), 0, 40)

    with :ok <- Social.require_verified(ctx.account),
         :ok <- check(not ctx.safe_mode, :safe_mode, "check-in is off in Safe Mode"),
         {:ok, v} <- venue(id),
         kind = if(v.kind == "gym", do: "sport", else: ctx.kind),
         %{} = p <- Profiles.get_by_kind(ctx.account, kind) || {:error, :basics_required},
         :ok <- Nearby.require_point(ctx),
         :ok <-
           check(
             (Nearby.dist_m(ctx, v.cell) || 1.0e9) <= @near_checkin_m,
             :venue,
             "you need to be at the venue"
           ) do
      own = Enum.map(ctx.own_ids, &Nearby.dump/1)
      Repo.query!("DELETE FROM venue_checkins WHERE profile_id = ANY($1)", [own])

      Repo.query!(
        """
        INSERT INTO venue_checkins (venue_id, profile_id, visible, zone, checked_in_at, auto_out_at)
        VALUES ($1, $2, $3, $4, now(), now() + make_interval(hours => $5))
        """,
        [
          Nearby.dump(v.id),
          Nearby.dump(p.id),
          params["visible"] != false,
          blank(zone),
          @max_hours
        ]
      )

      diff(v.id)
      here(ctx, v.id)
    end
  end

  @doc "PATCH /venues/:id/checkin {visible?, zone?} — e.g. Go invisible (R-12.6)."
  def update_checkin(ctx, id, params) do
    with {:ok, v} <- venue(id) do
      own = Enum.map(ctx.own_ids, &Nearby.dump/1)

      if is_boolean(params["visible"]),
        do:
          Repo.query!(
            "UPDATE venue_checkins SET visible = $3 WHERE venue_id = $1 AND profile_id = ANY($2)",
            [Nearby.dump(v.id), own, params["visible"]]
          )

      if Map.has_key?(params, "zone"),
        do:
          Repo.query!(
            "UPDATE venue_checkins SET zone = $3 WHERE venue_id = $1 AND profile_id = ANY($2)",
            [
              Nearby.dump(v.id),
              own,
              blank(params["zone"] && String.slice(to_string(params["zone"]), 0, 40))
            ]
          )

      diff(v.id)
      here(ctx, v.id)
    end
  end

  def checkout(ctx) do
    rows =
      Repo.query!(
        "DELETE FROM venue_checkins WHERE profile_id = ANY($1) RETURNING venue_id::text",
        [
          Enum.map(ctx.own_ids, &Nearby.dump/1)
        ]
      ).rows
      |> Nearby.utc()
      |> Nearby.utc()

    Enum.each(List.flatten(rows), &diff/1)
    :ok
  end

  @doc "GET /venues/:id/here (S-17). 403 unless the caller is checked in here (AC-12.1)."
  def here(ctx, id) do
    with {:ok, v} <- venue(id) do
      own = Enum.map(ctx.own_ids, &Nearby.dump/1)

      case Repo.query!(
             "SELECT profile_id::text, visible FROM venue_checkins WHERE venue_id = $1 AND profile_id = ANY($2) AND auto_out_at > now()",
             [Nearby.dump(v.id), own]
           ).rows do
        [[me, visible]] ->
          rows =
            Repo.query!(
              """
              SELECT c.profile_id::text, c.zone, c.checked_in_at, c.visible,
                     EXISTS (SELECT 1 FROM taps t WHERE t.from_profile_id = c.profile_id AND t.to_profile_id = ANY($2))
              FROM venue_checkins c WHERE c.venue_id = $1 AND c.auto_out_at > now() AND c.profile_id <> $3
              ORDER BY c.checked_in_at DESC
              """,
              [Nearby.dump(v.id), own, Nearby.dump(me)]
            ).rows
            |> Nearby.utc()
            |> Nearby.utc()

          seen = if visible, do: Enum.filter(rows, &Enum.at(&1, 3)), else: []
          cards = Nearby.people(ctx, Enum.map(seen, &hd/1))

          people =
            for [pid, zone, at, _, tapped] <- seen,
                cards[pid],
                do: %{profile: cards[pid], zone: zone, since: at, tapped_me: tapped}

          {:ok,
           %{
             venue: %{id: v.id, name: v.name, kind: v.kind},
             me: %{profile_id: me, visible: visible},
             stats: %{
               total: count_label(length(rows) + 1),
               visible_to_you: length(people),
               tapped_you: Enum.count(people, & &1.tapped_me)
             },
             people: people
           }}

        _ ->
          {:error, {:forbidden, "Check in to see who is here"}}
      end
    end
  end

  # venue:{id} here.diff (counts only; clients refetch the list).
  defp diff(id),
    do: Phoenix.PubSub.broadcast(Thirstr.PubSub, "venue:" <> id, {:event, "here.diff", %{}})

  @doc "Auto check-out after 4 h (R-12.6); leaving the geofence is detected by the app."
  def sweep do
    Repo.query!("DELETE FROM venue_checkins WHERE auto_out_at < now() RETURNING venue_id::text").rows
    |> Nearby.utc()
    |> Nearby.utc()
    |> List.flatten()
    |> Enum.uniq()
    |> Enum.each(&diff/1)
  end

  defp blank(nil), do: nil
  defp blank(""), do: nil
  defp blank(s), do: s

  @doc "Is this account checked in at venue `id` (channel join)?"
  def checked_in?(ctx, id) do
    match?({:ok, _}, here(ctx, id))
  end
end
