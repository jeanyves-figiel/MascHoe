defmodule Thirstr.Location do
  @moduledoc """
  F-05 location levels (subset for onboarding S-04 and Welcome counts).
  The server receives H3 cells computed on device; it never sees coordinates
  except for Exact pins (Valkey, not here).
  """
  alias Thirstr.Repo
  alias Thirstr.Accounts.Account
  alias Thirstr.Profiles.Profile

  @levels ~w(hidden city area exact)

  @doc "Upserts or clears the profile's location cell row."
  def put(%Account{} = a, %Profile{} = p, %{"level" => level} = params) when level in @levels do
    cond do
      level == "hidden" and not Account.verified?(a) ->
        {:error, {:forbidden, "Hidden is available after you verify"}}

      level == "hidden" ->
        Repo.query!("DELETE FROM location_cells WHERE profile_id = $1", [dump(p.id)])
        {:ok, :hidden}

      level in ~w(area exact) ->
        with {:ok, r9} <- cell(params["cell_r9"], 9) do
          upsert(p, level, r9, :r9, params)
        end

      level == "city" ->
        with {:ok, r5} <- city_cell(params) do
          upsert(p, level, r5, :r5, params)
        end
    end
  end

  def put(_, _, _),
    do: {:error, {:validation, %{level: ["must be one of #{Enum.join(@levels, ", ")}"]}}}

  defp upsert(p, level, cell, :r9, params) do
    Repo.query!(
      """
      INSERT INTO location_cells (profile_id, level, cell_r9, cell_r8, cell_r7, cell_r5, hide_from_hidden, updated_at)
      SELECT $1, $2, c::bigint, h3_cell_to_parent(c, 8)::bigint, h3_cell_to_parent(c, 7)::bigint,
             h3_cell_to_parent(c, 5)::bigint, $4, now()
      FROM (SELECT $3::text::h3index AS c) s
      ON CONFLICT (profile_id) DO UPDATE SET level = EXCLUDED.level, cell_r9 = EXCLUDED.cell_r9,
        cell_r8 = EXCLUDED.cell_r8, cell_r7 = EXCLUDED.cell_r7, cell_r5 = EXCLUDED.cell_r5,
        hide_from_hidden = EXCLUDED.hide_from_hidden, updated_at = now()
      """,
      [dump(p.id), level, cell, params["hide_from_hidden"] == true]
    )

    {:ok, level}
  end

  defp upsert(p, "city", cell, :r5, params) do
    Repo.query!(
      """
      INSERT INTO location_cells (profile_id, level, cell_r9, cell_r8, cell_r7, cell_r5, hide_from_hidden, updated_at)
      VALUES ($1, 'city', NULL, NULL, NULL, $2::text::h3index::bigint, $3, now())
      ON CONFLICT (profile_id) DO UPDATE SET level = 'city', cell_r9 = NULL, cell_r8 = NULL, cell_r7 = NULL,
        cell_r5 = EXCLUDED.cell_r5, hide_from_hidden = EXCLUDED.hide_from_hidden, updated_at = now()
      """,
      [dump(p.id), cell, params["hide_from_hidden"] == true]
    )

    {:ok, "city"}
  end

  defp city_cell(%{"city_id" => id}) when is_integer(id) do
    case Repo.query!("SELECT cell_r5::h3index::text FROM cities WHERE id = $1", [id]) do
      %{rows: [[c]]} -> {:ok, c}
      _ -> {:error, {:validation, %{city_id: ["unknown city"]}}}
    end
  end

  defp city_cell(%{"cell_r5" => c}), do: cell(c, 5)
  defp city_cell(_), do: {:error, {:validation, %{city_id: ["can't be blank"]}}}

  @doc "Validates an H3 hex string at the expected resolution."
  def cell(hex, res) when is_binary(hex) do
    if Regex.match?(~r/^[0-9a-f]{15}$/, hex) do
      case Repo.query(
             "SELECT h3_is_valid_cell($1::text::h3index) AND h3_get_resolution($1::text::h3index) = $2",
             [hex, res]
           ) do
        {:ok, %{rows: [[true]]}} -> {:ok, hex}
        _ -> {:error, {:validation, %{"cell_r#{res}" => ["invalid H3 cell"]}}}
      end
    else
      {:error, {:validation, %{"cell_r#{res}" => ["invalid H3 cell"]}}}
    end
  end

  def cell(_, res), do: {:error, {:validation, %{"cell_r#{res}" => ["can't be blank"]}}}

  # ------------------------------------------------------------- cities & welcome

  def search_cities(q) when is_binary(q) and byte_size(q) >= 2 do
    pattern = String.downcase(q) |> String.replace(~r/[%_\\]/, "") |> Kernel.<>("%")

    Repo.query!(
      "SELECT id, name, country, cell_r5::h3index::text FROM cities WHERE lower(name) LIKE $1 ORDER BY name LIMIT 10",
      [pattern]
    ).rows
    |> Enum.map(fn [id, name, country, cell] ->
      %{id: id, name: name, country: country, cell_r5: cell}
    end)
  end

  def search_cities(_), do: []

  @doc """
  R-02.2 / S-01: visible-people counts around a city, for the blurred live map.
  Counts per r7 cell; no profile data. Paused/hidden profiles excluded.
  """
  def welcome(city_name) do
    case Repo.query!(
           "SELECT name, cell_r5::h3index::text, lat, lng FROM cities WHERE lower(name) = lower($1) LIMIT 1",
           [city_name]
         ).rows do
      [[name, r5, lat, lng]] ->
        %{rows: cells} =
          Repo.query!(
            """
            SELECT lc.cell_r7::h3index::text, count(*)
            FROM location_cells lc
            JOIN profiles p ON p.id = lc.profile_id
            JOIN accounts a ON a.id = p.account_id
            WHERE lc.cell_r5 IN (SELECT h3_grid_disk($1::text::h3index, 1)::bigint)
              AND lc.cell_r7 IS NOT NULL AND a.status = 'active'
            GROUP BY 1
            """,
            [r5]
          )

        total = cells |> Enum.map(&List.last/1) |> Enum.sum()

        %{
          city: name,
          center: %{lat: lat, lng: lng},
          count: display_count(total),
          cells: Enum.map(cells, fn [c, n] -> %{cell: c, count: n} end)
        }

      _ ->
        %{city: nil, center: nil, count: nil, cells: []}
    end
  end

  @doc "R-02.2: rounded down to nearest 10 below 100; nil below 10 (S-01 special state)."
  def display_count(n) when n < 10, do: nil
  def display_count(n) when n < 100, do: div(n, 10) * 10
  def display_count(n), do: n

  defp dump(uuid), do: Ecto.UUID.dump!(uuid)
end
