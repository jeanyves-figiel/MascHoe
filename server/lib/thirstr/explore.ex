defmodule Thirstr.Explore do
  @moduledoc """
  F-04 Explore: grid, map, tray. Spec: docs/spec/features/F04-explore.md, F05-location.md.

  Privacy rules enforced here (server-side, R-04.9):
  - never return blocked (both ways), paused, quarantined, hidden or incognito accounts;
  - `hide_from_hidden` when the viewer is Hidden or incognito (R-05.6);
  - target settings: hide from unverified / new accounts / age range, show-in toggles;
  - Safe Mode targets visible only to verified accounts older than 7 days (F-14);
  - no raw coordinates except Exact pins whose audience includes the viewer (AC-04.2);
  - unverified viewers: no pins, distance ≥ "1–2 km" (R-04.10).
  Vouches never affect ordering (R-18.6).
  """
  alias Thirstr.{Location, Repo, Settings, Storage, Valkey}
  alias Thirstr.Accounts.Account

  @modes %{"hookup" => "now", "sport" => "sport", "friends" => "friends"}
  @page 60
  @near_m 10_000
  @far_m 100_000
  @sparse 30
  @online_s 300
  @edge_m %{5 => 8544, 7 => 1220, 8 => 461, 9 => 174}

  def kind_for_mode(mode), do: Map.get(@modes, mode)

  @doc "F-06 R-06.1b: the viewer's lens for a mode param (unknown → hookup)."
  def lens(mode) when mode in ["hookup", "friends", "sport"], do: mode
  def lens(_), do: "hookup"

  # ------------------------------------------------------------------ viewer

  @doc "Everything the queries need to know about the viewer."
  def viewer(%Account{} = a, mode) do
    kind = kind_for_mode(mode) || "now"

    own =
      Repo.query!("SELECT id::text, kind, age FROM profiles WHERE account_id = $1", [dump(a.id)]).rows

    %{
      account: a,
      mode: mode,
      lens: lens(mode),
      kind: kind,
      verified: Account.verified?(a),
      new: Account.new?(a),
      hidden: a.hidden or a.incognito,
      safe_mode: Account.safe_mode_on?(a),
      settings: Settings.get(a),
      point: Location.viewer_point(a),
      # R-06.1: one profile per account, whatever the mode.
      profile_id: Enum.find_value(own, fn [id, _, _] -> id end),
      age: Enum.find_value(own, fn [_, k, age] -> if k == "now", do: age end) || 30
    }
  end

  # ------------------------------------------------------------------ grid & tray

  @doc "GET /explore/grid (R-04.5): page of 60, same sort as the tray, sparse widening (R-04.7)."
  def grid(v, filters, cursor) do
    offset = parse_cursor(cursor)

    case v.point do
      nil ->
        %{items: [], next: nil, further_from: nil, reason: "no_location", fit_m: nil}

      _ ->
        all = candidates(v, filters, "show_in_grid") |> sorted()
        page = Enum.slice(all, offset, @page)
        next = if length(all) > offset + @page, do: Integer.to_string(offset + @page)
        further_from = Enum.find_index(all, & &1.further)

        %{
          items: Enum.map(page, &card(&1, v)),
          next: next,
          further_from: further_from && further_from - offset,
          reason: nil,
          fit_m: fit_m(all, v)
        }
    end
  end

  @fit_steps [500, 1_000, 2_000, 5_000, 10_000, 25_000, 50_000, 100_000]
  @fit_n 12

  @doc """
  R-04.15 auto-fit radius: distance to the 12th nearest visible person (or the furthest, if
  fewer), rounded up to a coarse step so it tells no more than the distance buckets.
  Unverified viewers: at least 2 km (R-04.10). nil when nobody is visible.
  """
  def fit_m([], _v), do: nil

  def fit_m(rows, v) do
    d =
      rows
      |> Enum.map(& &1.dist_m)
      |> Enum.sort()
      |> Enum.take(@fit_n)
      |> List.last()

    step = Enum.find(@fit_steps, List.last(@fit_steps), &(&1 >= d))
    if v.verified, do: step, else: max(step, 2_000)
  end

  @doc "GET /explore/tray (R-04.4): up to 20 active-now cards."
  def tray(v, filters) do
    if v.point do
      candidates(v, filters, "show_in_map")
      |> Enum.filter(&(&1.pin || &1.now || &1.online))
      |> sorted()
      |> Enum.take(20)
      |> Enum.map(&card(&1, v))
    else
      []
    end
  end

  @doc """
  GET /explore/summary (R-04.17): live header data. Per-mode count of people the viewer can see
  within the near radius (grid rules), Now count for the active mode, and the viewer's own
  city-level place name. `filters` apply to the active mode only; other modes use defaults.
  """
  def summary(%Account{} = a, mode, filters) do
    v = viewer(a, mode)

    case v.point do
      nil ->
        %{place: nil, counts: %{hookup: 0, friends: 0, sport: 0}, now: 0}

      point ->
        near = fn rows -> Enum.reject(rows, &(&1.dist_m > @near_m)) end
        active = candidates(v, filters, "show_in_grid") |> near.()

        counts =
          Map.new(~w(hookup friends sport), fn m ->
            n =
              if m == mode,
                do: length(active),
                else:
                  viewer(a, m)
                  |> candidates(parse_filters(%{}), "show_in_grid")
                  |> near.()
                  |> length()

            {String.to_atom(m), n}
          end)

        %{
          place: place(point),
          counts: counts,
          now: if(mode == "sport", do: 0, else: Enum.count(active, & &1.now))
        }
    end
  end

  @doc "City-level name for a point (nearest `cities` row to its r5 cell); nil when unknown."
  def place(%{lat: lat, lng: lng}) do
    [[r5]] =
      Repo.query!("SELECT h3_lat_lng_to_cell(point($1::float8, $2::float8), 5)::text", [lng, lat]).rows

    case city_name(r5) do
      "" -> nil
      n -> n
    end
  end

  # R-04.4 sort: exact by metres → Now → area by distance → online recency
  defp sorted(rows) do
    Enum.sort_by(rows, fn r ->
      group =
        cond do
          r.pin -> 0
          r.now -> 1
          true -> 2
        end

      {r.further, group, round(r.dist_m / 100), -(r.seen || 0)}
    end)
  end

  # ------------------------------------------------------------------ map

  @doc """
  GET /explore/map?bbox=w,s,e,n (R-04.2). Returns cell heat, avatars at stable random points
  inside their displayed cell (R-05.3), allowed Exact pins. Unverified viewers get r7 counts
  only; Safe Mode viewers get city-level (r5) counts only.
  """
  def map(v, bbox, filters) do
    with {:ok, {w, s, e, n}} <- parse_bbox(bbox) do
      res =
        cond do
          v.safe_mode -> 5
          not v.verified -> 7
          (e - w) * (n - s) > 2.0 -> 5
          true -> 7
        end

      cells = bbox_cells(w, s, e, n, res)

      rows =
        if cells == [] do
          []
        else
          candidates(v, Map.put(filters, :cells, {res, cells}), "show_in_map")
        end

      heat =
        rows
        |> Enum.group_by(&if(res == 5, do: &1.cell_r5, else: &1.cell_r7))
        |> Enum.map(fn {c, list} -> %{cell: c, res: res, count: length(list)} end)

      detail? = v.verified and not v.safe_mode and res == 7

      {pins, avatars} =
        if detail? do
          rows
          |> Enum.take(400)
          |> Enum.split_with(& &1.pin)
        else
          {[], []}
        end

      {:ok,
       %{
         cells: heat,
         pins: Enum.map(pins, &Map.merge(card(&1, v), %{lat: &1.pin.lat, lng: &1.pin.lng})),
         avatars:
           Enum.map(avatars, fn r ->
             {lat, lng} = stable_point(r.id, r.dcell_lat, r.dcell_lng, r.display_res)
             Map.merge(card(r, v), %{lat: lat, lng: lng})
           end)
       }}
    end
  end

  defp parse_bbox(s) when is_binary(s) do
    with [w, so, e, n] <- String.split(s, ","),
         {w, ""} <- Float.parse(w),
         {so, ""} <- Float.parse(so),
         {e, ""} <- Float.parse(e),
         {n, ""} <- Float.parse(n),
         true <- w < e and so < n and n - so < 20 and e - w < 40 do
      {:ok, {w, so, e, n}}
    else
      _ -> {:error, {:validation, %{bbox: ["w,s,e,n in degrees, max 20°×40°"]}}}
    end
  end

  defp parse_bbox(_), do: {:error, {:validation, %{bbox: ["required"]}}}

  defp bbox_cells(w, s, e, n, res) do
    %{rows: rows} =
      Repo.query!(
        """
        SELECT c::bigint FROM h3_polygon_to_cells($1::text::polygon, NULL::polygon[], $2::int) c
        LIMIT 3000
        """,
        ["((#{w},#{s}),(#{e},#{s}),(#{e},#{n}),(#{w},#{n}))", res]
      )

    List.flatten(rows)
  end

  @doc "R-05.3: deterministic point inside the displayed cell; seed = profile id + UTC date."
  def stable_point(id, lat, lng, res) do
    <<a::32, b::32, _::binary>> = :crypto.hash(:sha256, id <> Date.to_iso8601(Date.utc_today()))
    r = :math.sqrt(a / 4_294_967_295) * Map.get(@edge_m, res, 1220) * 0.6
    theta = b / 4_294_967_295 * 2 * :math.pi()
    dlat = r * :math.cos(theta) / 111_320
    dlng = r * :math.sin(theta) / (111_320 * :math.cos(lat * :math.pi() / 180))
    {lat + dlat, lng + dlng}
  end

  # ------------------------------------------------------------------ core query

  @doc false
  # The interpolated WHERE fragment is built from fixed clauses; all values are bound params.
  # sobelow_skip ["SQL.Query"]
  def candidates(v, filters, surface) do
    {where, params} = filter_sql(v, filters, surface)
    radius = if Map.has_key?(filters, :cells), do: nil, else: filters[:distance_max] || @far_m

    disk_k =
      case radius do
        nil -> 0
        r -> min(ceil(r / 15_000) + 1, 14)
      end

    base_params = [
      v.point.lng,
      v.point.lat,
      dump(v.account.id),
      v.lens,
      v.verified,
      v.hidden,
      v.new,
      v.age,
      disk_k
    ]

    sql = """
    WITH vp AS (SELECT point($1::float8, $2::float8) AS pt,
                       h3_lat_lng_to_cell(point($1::float8, $2::float8), 5) AS r5)
    SELECT p.id::text, p.display_name, p.age, p.gender, p.gender_other, p.fields, p.visibility_map,
           p.seeded, a.id::text, a.verified_at, a.inserted_at, a.settings, lc.level, lc.display_res,
           d.dcell::text, (h3_cell_to_lat_lng(d.dcell))[1], (h3_cell_to_lat_lng(d.dcell))[0],
           h3_great_circle_distance(h3_cell_to_lat_lng(d.dcell), vp.pt, 'm'),
           ns.status, ns.text, ns.created_at, ph.storage_key,
           lc.cell_r7, lc.cell_r5, p.public_updated_at
    FROM vp, location_cells lc
    JOIN profiles p ON p.id = lc.profile_id
    JOIN accounts a ON a.id = p.account_id
    CROSS JOIN LATERAL (SELECT (CASE lc.display_res WHEN 9 THEN lc.cell_r9 WHEN 8 THEN lc.cell_r8
                          WHEN 7 THEN lc.cell_r7 ELSE lc.cell_r5 END)::h3index AS dcell) d
    LEFT JOIN now_status ns ON ns.profile_id = p.id AND ns.expires_at > now() AND $4::text <> 'sport'
    LEFT JOIN photos ph ON ph.id = p.photo_ids[1]
    WHERE $4::text = ANY(p.show_in)
      AND ($9 = 0 OR lc.cell_r5 IN (SELECT h3_grid_disk(vp.r5, $9)::bigint))
      AND a.id <> $3
      AND a.status = 'active' AND NOT a.incognito AND NOT a.hidden
      AND (cardinality(p.photo_ids) > 0 OR p.seeded)
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.account_from = $3 AND b.account_to = a.id)
                                               OR (b.account_from = a.id AND b.account_to = $3))
      AND NOT EXISTS (SELECT 1 FROM profile_hides h WHERE h.account_id = $3 AND h.profile_id = p.id)
      AND NOT (lc.hide_from_hidden AND $6)
      AND (NOT COALESCE((a.settings->>'hide_from_unverified')::boolean, true) OR $5)
      AND (NOT COALESCE((a.settings->>'hide_from_new')::boolean, false) OR NOT $7)
      AND (a.settings->>'hide_from_age_min' IS NULL OR $8 >= (a.settings->>'hide_from_age_min')::int)
      AND (a.settings->>'hide_from_age_max' IS NULL OR $8 <= (a.settings->>'hide_from_age_max')::int)
      AND (NOT (a.safe_mode = 'on' OR a.safe_mode_active) OR ($5 AND NOT $7))
      #{where}
    ORDER BY 18
    LIMIT 1500
    """

    %{rows: rows} = Repo.query!(sql, base_params ++ params)

    rows = Enum.map(rows, &row/1)
    rows = if radius, do: Enum.filter(rows, &(&1.dist_m <= radius)), else: rows

    rows =
      if radius && is_nil(filters[:distance_max]) do
        near = Enum.count(rows, &(&1.dist_m <= @near_m))

        if near >= @sparse,
          do: Enum.filter(rows, &(&1.dist_m <= @near_m)),
          else: Enum.map(rows, &Map.put(&1, :further, &1.dist_m > @near_m))
      else
        rows
      end

    rows |> enrich(v) |> post_filter(filters)
  end

  defp row([
         id,
         name,
         age,
         gender,
         gother,
         fields,
         vis,
         seeded,
         aid,
         vat,
         ins,
         settings,
         level,
         dres,
         dcell,
         dlat,
         dlng,
         dist,
         ns,
         ntext,
         nat,
         key,
         r7,
         r5,
         upd
       ]) do
    [vat, ins, nat, upd] = Enum.map([vat, ins, nat, upd], &utc/1)

    %{
      id: id,
      display_name: name,
      age: age,
      gender: gender,
      gender_other: gother,
      fields: fields,
      vis: vis,
      seeded: seeded,
      account_id: aid,
      verified_at: vat,
      inserted_at: ins,
      settings: Map.merge(Settings.defaults(), settings || %{}),
      level: level,
      display_res: dres,
      dcell: dcell,
      dcell_lat: dlat,
      dcell_lng: dlng,
      dist_m: dist,
      now:
        if(ns,
          do: %{status: ns, text: ntext, fresh: DateTime.diff(DateTime.utc_now(), nat) < 600}
        ),
      photo_key: key,
      cell_r7: r7 && to_hex(r7),
      cell_r5: r5 && to_hex(r5),
      further: false,
      pin: nil,
      seen: nil,
      online: false,
      updated_at: upd
    }
  end

  def utc(nil), do: nil
  def utc(%NaiveDateTime{} = n), do: DateTime.from_naive!(n, "Etc/UTC")
  def utc(%DateTime{} = d), do: d

  def utc_any(%NaiveDateTime{} = n), do: utc(n)
  def utc_any(v), do: v

  defp to_hex(i) when is_integer(i), do: Integer.to_string(i, 16) |> String.downcase()

  # Pins (audience-checked) and online state from Valkey.
  defp enrich([], _v), do: []

  defp enrich(rows, v) do
    pins = rows |> Enum.filter(&(&1.level == "exact")) |> Enum.map(& &1.id) |> Location.pins()

    chats =
      if Enum.any?(pins, fn {_, p} -> p.audience == "chats" end) and v.profile_id,
        do: contacts_of(v.profile_id, Map.keys(pins)),
        else: MapSet.new()

    seen =
      rows
      |> Enum.map(& &1.account_id)
      |> Enum.uniq()
      |> then(fn ids ->
        Enum.zip(ids, Valkey.command!(["MGET" | Enum.map(ids, &("seen:" <> &1))]))
      end)
      |> Map.new(fn {id, t} -> {id, t && String.to_integer(t)} end)

    now = System.system_time(:second)
    see_online? = v.settings["online_visible"]
    pins_ok? = v.verified and not v.safe_mode and v.mode != "sport"

    Enum.map(rows, fn r ->
      pin = if pins_ok?, do: allowed_pin(pins[r.id], r.id, v, chats)
      t = seen[r.account_id]
      shows_online? = see_online? and r.settings["online_visible"]

      r
      |> Map.put(:pin, pin)
      |> Map.put(:dist_m, if(pin, do: haversine(v.point, pin), else: r.dist_m))
      |> Map.put(:online, shows_online? and t != nil and now - t < @online_s)
      |> Map.put(:seen, if(shows_online?, do: t))
    end)
  end

  defp allowed_pin(nil, _id, _v, _chats), do: nil

  defp allowed_pin(pin, id, v, chats) do
    case pin.audience do
      "everyone" -> pin
      "verified" -> if v.verified, do: pin
      "chats" -> if MapSet.member?(chats, id), do: pin
      _ -> nil
    end
  end

  def contacts_of(profile_id, ids) do
    Repo.query!(
      """
      SELECT CASE WHEN profile_a = $1 THEN profile_b ELSE profile_a END::text FROM contacts
      WHERE (profile_a = $1 AND profile_b = ANY($2)) OR (profile_b = $1 AND profile_a = ANY($2))
      """,
      [dump(profile_id), Enum.map(ids, &dump/1)]
    ).rows
    |> List.flatten()
    |> MapSet.new()
  end

  defp post_filter(rows, f) do
    rows
    |> then(&if f[:online_now], do: Enum.filter(&1, fn r -> r.online end), else: &1)
  end

  # ------------------------------------------------------------------ filters (R-04.8)

  # filter key => {jsonb field, :enum | :multi}
  @field_filters %{
    position: {"position", :enum},
    hosting: {"hosting", :enum},
    tribes: {"tribes", :multi},
    build: {"build", :enum},
    looking_for: {"looking_for", :multi},
    languages: {"languages", :multi},
    sports: {"sports", :multi},
    sport_level: {"sport_level", :enum},
    schedule: {"schedule", :multi},
    sport_intent: {"sport_intent", :enum},
    orientation: {"orientation", :enum}
  }
  # hookup filters only for verified viewers (R-04.8) and only in the Hookup lens (R-06.1b)
  @verified_only ~w(position hosting)a
  @hookup_only ~w(position hosting)a

  @doc "Parses query params into a filter map (all filters free, never HIV/ethnicity)."
  def parse_filters(params) do
    list = fn k ->
      case params[k] do
        nil -> nil
        "" -> nil
        s when is_binary(s) -> String.split(s, ",", trim: true)
        l when is_list(l) -> l
      end
    end

    int = fn k ->
      case params[k] do
        nil ->
          nil

        i when is_integer(i) ->
          i

        s ->
          case Integer.parse(to_string(s)) do
            {i, _} -> i
            _ -> nil
          end
      end
    end

    bool = fn k, default ->
      case params[k] do
        nil -> default
        v -> v in [true, "true", "1"]
      end
    end

    base = %{
      age_min: int.("age_min"),
      age_max: int.("age_max"),
      distance_max: (d = int.("distance_max")) && min(d, @far_m),
      verified_only: bool.("verified_only", true),
      online_now: bool.("online_now", false),
      has_now: bool.("has_now", false),
      hide_creators: bool.("hide_creators", true),
      new_members: bool.("new_members", false)
    }

    Enum.reduce(@field_filters, base, fn {k, _}, acc ->
      case list.(Atom.to_string(k)) do
        nil -> acc
        vals -> Map.put(acc, k, vals)
      end
    end)
  end

  defp filter_sql(v, f, _surface) do
    # numbered params continue after the 9 base params
    acc = {[], [], 10}

    add = fn {clauses, params, n}, clause_fun, value ->
      {[clause_fun.(n) | clauses], params ++ [value], n + 1}
    end

    acc = if f[:age_min], do: add.(acc, &"p.age >= $#{&1}", f.age_min), else: acc
    acc = if f[:age_max], do: add.(acc, &"p.age <= $#{&1}", f.age_max), else: acc

    {cl, pa, n} = acc
    cl = if f[:verified_only], do: ["a.verified_at IS NOT NULL" | cl], else: cl
    cl = if f[:has_now], do: ["ns.status IS NOT NULL" | cl], else: cl

    cl =
      if f[:hide_creators],
        do: ["NOT COALESCE((p.fields->>'creator')::boolean, false)" | cl],
        else: cl

    cl = if f[:new_members], do: ["a.inserted_at > now() - interval '14 days'" | cl], else: cl
    acc = {cl, pa, n}

    acc =
      case f[:cells] do
        {res, cells} ->
          col = if res == 5, do: "lc.cell_r5", else: "lc.cell_r7"
          add.(acc, &"#{col} = ANY($#{&1}::bigint[])", cells)

        _ ->
          acc
      end

    acc =
      Enum.reduce(@field_filters, acc, fn {k, {field, type}}, acc ->
        vals = f[k]

        cond do
          vals in [nil, []] ->
            acc

          not filter_allowed?(k, v) ->
            acc

          true ->
            default = Thirstr.Profiles.Fields.default_visibility(field)

            add.(
              acc,
              fn i ->
                match =
                  if type == :multi,
                    do: "p.fields->'#{field}' ?| $#{i}::text[]",
                    else: "p.fields->>'#{field}' = ANY($#{i}::text[])"

                "(#{match} AND (COALESCE(p.visibility_map->>'#{field}', '#{default}') = 'public' OR #{v.verified}))"
              end,
              vals
            )
        end
      end)

    {clauses, params, _} = acc
    where = Enum.map_join(Enum.reverse(clauses), "\n", &("      AND " <> &1))
    {where, params}
  end

  defp filter_allowed?(k, v) do
    not (k in @verified_only and not v.verified) and
      not (k in @hookup_only and Map.get(v, :lens, "hookup") != "hookup")
  end

  # ------------------------------------------------------------------ cards

  @doc "Card JSON (R-04.5). No account id, no raw coordinates (pins added by the caller)."
  def card(r, v) do
    viewer = if v.verified, do: :verified, else: :stranger
    {fields, _} = Thirstr.Profiles.Fields.visible(r.fields || %{}, r.vis || %{}, viewer)
    fields = Thirstr.Profiles.Fields.lens(fields, Map.get(v, :lens, "hookup"))

    %{
      id: r.id,
      display_name: r.display_name,
      age: r.age,
      verified: not is_nil(r.verified_at),
      photo: r.photo_key && Storage.presigned_get(r.photo_key),
      online: r.online,
      distance: distance(r, v),
      now: r.now,
      exact: not is_nil(r.pin),
      pin_expires_at: r.pin && r.pin.expires_at,
      further: r.further,
      creator: fields["creator"] == true,
      intent: fields["sport_intent"],
      position: fields["position"],
      new: DateTime.diff(DateTime.utc_now(), r.inserted_at, :day) < 14
    }
  end

  @buckets [
    {200, "lt200"},
    {500, "200_500"},
    {1000, "500_1k"},
    {2000, "1_2k"},
    {5000, "2_5k"},
    {10_000, "5_10k"}
  ]

  @doc "R-04.6 distance buckets. Clients localize the bucket key."
  def distance(r, v) do
    show = r.settings["show_distance"]

    cond do
      show == "none" ->
        nil

      r.level == "city" ->
        %{kind: "city", city: city_name(r.cell_r5)}

      r.pin && show == "exact" && v.verified ->
        %{kind: "exact", m: round(r.dist_m / 5) * 5}

      true ->
        d = if v.verified, do: r.dist_m, else: max(r.dist_m, 1000.0)
        b = Enum.find_value(@buckets, "10k_plus", fn {max, key} -> if d < max, do: key end)
        %{kind: "area", bucket: b}
    end
  end

  defp city_name(nil), do: nil

  defp city_name(r5hex) do
    key = "cityname:" <> r5hex

    case Valkey.command!(["GET", key]) do
      nil ->
        name =
          case Repo.query!(
                 """
                 SELECT name FROM cities
                 ORDER BY h3_great_circle_distance(h3_cell_to_lat_lng(cell_r5::h3index), h3_cell_to_lat_lng($1::text::h3index)) LIMIT 1
                 """,
                 [r5hex]
               ).rows do
            [[n]] -> n
            _ -> ""
          end

        Valkey.command!(["SET", key, name, "EX", "86400"])
        name

      n ->
        n
    end
  end

  defp haversine(%{lat: la1, lng: lo1}, %{lat: la2, lng: lo2}) do
    r = 6_371_000
    dlat = (la2 - la1) * :math.pi() / 180
    dlng = (lo2 - lo1) * :math.pi() / 180

    a =
      :math.sin(dlat / 2) ** 2 +
        :math.cos(la1 * :math.pi() / 180) * :math.cos(la2 * :math.pi() / 180) *
          :math.sin(dlng / 2) ** 2

    2 * r * :math.asin(:math.sqrt(a))
  end

  defp parse_cursor(nil), do: 0

  defp parse_cursor(c) do
    case Integer.parse(to_string(c)) do
      {n, ""} when n >= 0 and n < 5000 -> n
      _ -> 0
    end
  end

  defp dump(uuid), do: Ecto.UUID.dump!(uuid)
end
