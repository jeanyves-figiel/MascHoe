defmodule Thirstr.Nearby do
  @moduledoc """
  Shared helpers for B3 surfaces (Tonight, parties, activities, venues): the viewer's area,
  author cards and distance buckets. Items carry H3 cells only, never coordinates (AC-10.1).
  """
  alias Thirstr.{Explore, Location, Repo, Settings, Storage}
  alias Thirstr.Accounts.Account

  @buckets [
    {200, "lt200"},
    {500, "200_500"},
    {1000, "500_1k"},
    {2000, "1_2k"},
    {5000, "2_5k"},
    {10_000, "5_10k"}
  ]

  @doc "Viewer context: point, area cells, profile for the mode's kind."
  def ctx(%Account{} = a, mode \\ "hookup") do
    kind = Explore.kind_for_mode(mode) || "now"
    point = Location.viewer_point(a)

    own =
      Repo.query!("SELECT id::text, kind FROM profiles WHERE account_id = $1", [dump(a.id)]).rows

    %{
      account: a,
      mode: mode,
      kind: kind,
      verified: Account.verified?(a),
      safe_mode: Account.safe_mode_on?(a),
      settings: Settings.get(a),
      point: point,
      profile_id: Enum.find_value(own, fn [id, k] -> if k == kind, do: id end),
      own_ids: Enum.map(own, &hd/1),
      r5: point && cell(point, 5)
    }
  end

  @doc "H3 cell (bigint) of a point at a resolution."
  def cell(%{lat: lat, lng: lng}, res) do
    [[c]] =
      Repo.query!("SELECT h3_lat_lng_to_cell(point($1::float8, $2::float8), $3)::bigint", [
        lng * 1.0,
        lat * 1.0,
        res
      ]).rows

    c
  end

  @doc "r5 cells within k rings of the viewer's r5 (k=2 ≈ 20–25 km)."
  def area(%{r5: nil}, _k), do: []

  def area(%{r5: r5}, k) do
    Repo.query!("SELECT h3_grid_disk($1::bigint::h3index, $2)::bigint", [r5, k]).rows
    |> List.flatten()
  end

  @doc "Metres between the viewer and a cell centroid."
  def dist_m(%{point: nil}, _cell), do: nil

  def dist_m(%{point: p}, cell) do
    [[d]] =
      Repo.query!(
        "SELECT h3_great_circle_distance(h3_cell_to_lat_lng($1::bigint::h3index), point($2::float8, $3::float8), 'm')",
        [cell, p.lng * 1.0, p.lat * 1.0]
      ).rows

    d
  end

  def bucket(nil), do: nil

  def bucket(m) do
    %{
      kind: "area",
      bucket: Enum.find_value(@buckets, "10k_plus", fn {max, k} -> if m < max, do: k end)
    }
  end

  @doc "Author cards for profile ids: name, age, verified, main photo. Blocked pairs dropped."
  def people(_ctx, []), do: %{}

  def people(ctx, ids) do
    Repo.query!(
      """
      SELECT p.id::text, p.display_name, p.age, a.verified_at IS NOT NULL, ph.storage_key,
             p.fields->>'sport_intent', a.id::text
      FROM profiles p JOIN accounts a ON a.id = p.account_id
      LEFT JOIN photos ph ON ph.id = p.photo_ids[1]
      WHERE p.id = ANY($1) AND (a.status = 'active' OR a.id = $2)
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.account_from = $2 AND b.account_to = a.id)
                                                 OR (b.account_from = a.id AND b.account_to = $2))
      """,
      [Enum.map(Enum.uniq(ids), &dump/1), dump(ctx.account.id)]
    ).rows
    |> Map.new(fn [id, name, age, verified, key, intent, aid] ->
      {id,
       %{
         id: id,
         display_name: name,
         age: age,
         verified: verified,
         photo: key && Storage.presigned_get(key),
         intent: intent,
         self: aid == ctx.account.id
       }}
    end)
  end

  @doc "Profile ids (among `ids`) that have a chat with any of the viewer's profiles."
  def chat_partners(ctx, ids) do
    ctx.own_ids
    |> Enum.flat_map(&MapSet.to_list(Explore.contacts_of(&1, ids)))
    |> MapSet.new()
  end

  def require_point(%{point: nil}),
    do: {:error, {:validation, %{location: ["set your location first"]}}}

  def require_point(_), do: :ok

  def require_profile(%{profile_id: nil}), do: {:error, :basics_required}
  def require_profile(_), do: :ok

  @doc "Raw query timestamps come back naive (stored UTC); tag them as UTC for JSON and compares."
  def utc(rows) when is_list(rows),
    do: Enum.map(rows, fn r -> Enum.map(r, &Explore.utc_any/1) end)

  def dump(uuid), do: Ecto.UUID.dump!(uuid)
end
