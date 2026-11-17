defmodule ThirstrWeb.ExploreTest do
  use ThirstrWeb.ConnCase, async: false

  # B1: F-04 Explore, F-05 Location, F-06 Profiles, F-09 Now.
  setup %{conn: conn} do
    viewer = onboarded(conn)
    other = onboarded(conn, cell: zurich_ring(2), basics: [display_name: "Theo"])
    {:ok, viewer: viewer, other: other, conn: conn}
  end

  defp grid(c, q \\ ""),
    do: c |> recycle_authed() |> get("/v1/explore/grid?mode=hookup" <> q) |> json_response(200)

  test "grid shows nearby verified profiles with a distance bucket, no coordinates (AC-04.2)", %{
    viewer: v,
    other: o
  } do
    res = grid(v.c)
    assert o.pid in ids(res["items"])
    card = Enum.find(res["items"], &(&1["id"] == o.pid))
    assert card["distance"]["kind"] == "area"
    refute Map.has_key?(card, "lat")
    refute res |> Jason.encode!() =~ "account"
  end

  @tag ac: "AC-04.3"
  test "Hidden and incognito users never appear", %{viewer: v, other: o} do
    o.c
    |> recycle_authed()
    |> put("/v1/me/location", %{level: "hidden", cell_r9: zurich_r9()})
    |> json_response(200)

    refute o.pid in ids(grid(v.c)["items"])

    o.c
    |> recycle_authed()
    |> put("/v1/me/location", %{level: "area", cell_r9: zurich_r9()})
    |> json_response(200)

    assert o.pid in ids(grid(v.c)["items"])

    o.c
    |> recycle_authed()
    |> patch("/v1/me/visibility", %{incognito: true})
    |> json_response(200)

    refute o.pid in ids(grid(v.c)["items"])
  end

  test "hide me from hidden users (R-05.6)", %{viewer: v, other: o} do
    o.c
    |> recycle_authed()
    |> patch("/v1/me/visibility", %{hide_from_hidden: true})
    |> json_response(200)

    assert o.pid in ids(grid(v.c)["items"])

    v.c
    |> recycle_authed()
    |> patch("/v1/me/visibility", %{incognito: true})
    |> json_response(200)

    refute o.pid in ids(grid(v.c)["items"])
  end

  @tag ac: "AC-05.4"
  test "unverified cannot set Hidden, incognito or Exact", %{conn: conn} do
    u = onboarded(conn, verified: false)

    for body <- [
          %{level: "hidden", cell_r9: zurich_r9()},
          %{level: "exact", cell_r9: zurich_r9()}
        ] do
      assert %{"error" => %{"code" => "not_verified"}} =
               u.c |> recycle_authed() |> put("/v1/me/location", body) |> json_response(403)
    end

    assert %{"error" => %{"code" => "not_verified"}} =
             u.c
             |> recycle_authed()
             |> patch("/v1/me/visibility", %{incognito: true})
             |> json_response(403)
  end

  test "unverified viewer: no pins, distance ≥ 1–2 km (R-04.10)", %{conn: conn, other: o} do
    u = onboarded(conn, verified: false)
    pin_on(o)
    card = grid(u.c)["items"] |> Enum.find(&(&1["id"] == o.pid))
    assert card["distance"]["bucket"] in ~w(1_2k 2_5k 5_10k 10k_plus)
    refute card["exact"]
  end

  defp pin_on(o) do
    o.c
    |> recycle_authed()
    |> put("/v1/me/pin", %{
      lat: 47.3769,
      lng: 8.5417,
      ttl_s: 1800,
      audience: "verified",
      confirm: true
    })
    |> json_response(200)
  end

  test "exact pin visible to verified viewers with metres, removed on delete (R-05.4)", %{
    viewer: v,
    other: o
  } do
    me = pin_on(o)
    assert me["location"]["level"] == "exact"
    card = grid(v.c)["items"] |> Enum.find(&(&1["id"] == o.pid))
    assert card["exact"]
    o.c |> recycle_authed() |> delete("/v1/me/pin") |> json_response(200)
    card = grid(v.c)["items"] |> Enum.find(&(&1["id"] == o.pid))
    refute card["exact"]
  end

  test "pin requires confirm and an allowed TTL (max 4 h, D-07)", %{other: o} do
    assert o.c
           |> recycle_authed()
           |> put("/v1/me/pin", %{lat: 47.3, lng: 8.5, ttl_s: 18_000, confirm: true})
           |> json_response(422)

    assert o.c
           |> recycle_authed()
           |> put("/v1/me/pin", %{lat: 47.3, lng: 8.5, ttl_s: 1800})
           |> json_response(422)
  end

  test "map returns avatars inside cells and pins with coordinates only for allowed pins", %{
    viewer: v,
    other: o
  } do
    pin_on(o)

    res =
      v.c
      |> recycle_authed()
      |> get("/v1/explore/map?mode=hookup&bbox=8.50,47.36,8.58,47.39")
      |> json_response(200)

    assert Enum.any?(res["pins"], &(&1["id"] == o.pid))
    assert res["cells"] != []
  end

  test "blocks hide both ways and the profile becomes Not available", %{viewer: v, other: o} do
    v.c |> recycle_authed() |> post("/v1/profiles/#{o.pid}/block") |> response(204)
    refute o.pid in ids(grid(v.c)["items"])
    refute v.pid in ids(grid(o.c)["items"])
    assert o.c |> recycle_authed() |> get("/v1/profiles/#{v.pid}") |> json_response(404)

    assert [%{"profile_id" => _}] =
             v.c
             |> recycle_authed()
             |> get("/v1/me/blocks")
             |> json_response(200)
             |> Map.get("blocks")

    v.c |> recycle_authed() |> delete("/v1/me/blocks/#{o.pid}") |> response(204)
    assert o.pid in ids(grid(v.c)["items"])
  end

  test "hide this profile removes it from the viewer's Explore only", %{viewer: v, other: o} do
    v.c |> recycle_authed() |> post("/v1/profiles/#{o.pid}/hide") |> response(204)
    refute o.pid in ids(grid(v.c)["items"])
    assert v.pid in ids(grid(o.c)["items"])
  end

  test "taps: verified only, mutual detection, inbox", %{viewer: v, other: o, conn: conn} do
    assert %{"mutual" => false} =
             v.c |> recycle_authed() |> post("/v1/profiles/#{o.pid}/tap") |> json_response(200)

    assert %{"mutual" => true} =
             o.c |> recycle_authed() |> post("/v1/profiles/#{v.pid}/tap") |> json_response(200)

    [t] = o.c |> recycle_authed() |> get("/v1/taps") |> json_response(200) |> Map.get("taps")
    assert t["profile"]["id"] == v.pid and t["mutual"]

    u = onboarded(conn, verified: false)
    assert u.c |> recycle_authed() |> post("/v1/profiles/#{o.pid}/tap") |> json_response(403)
  end

  @tag ac: "AC-15.1"
  test "quarantined account gets success on tap, recipient receives nothing", %{
    viewer: v,
    other: o
  } do
    Thirstr.Repo.query!(
      "UPDATE accounts SET status = 'quarantined' WHERE id = (SELECT account_id FROM profiles WHERE id = $1)",
      [Ecto.UUID.dump!(v.pid)]
    )

    assert v.c |> recycle_authed() |> post("/v1/profiles/#{o.pid}/tap") |> json_response(200)

    assert [] ==
             o.c |> recycle_authed() |> get("/v1/taps") |> json_response(200) |> Map.get("taps")

    refute v.pid in ids(grid(o.c)["items"])
  end

  @tag ac: "AC-06.1"
  test "strangers never get fields above their audience; health never public (AC-06.2)", %{
    viewer: v,
    other: o,
    conn: conn
  } do
    o.c
    |> recycle_authed()
    |> patch("/v1/me/profiles/#{o.pid}", %{
      fields: %{bio: "Climber, coffee", position: "vers", hosting: "can_host", prep: "on"},
      visibility_map: %{prep: "verified"}
    })
    |> json_response(200)

    assert %{"error" => %{"code" => "validation"}} =
             o.c
             |> recycle_authed()
             |> patch("/v1/me/profiles/#{o.pid}", %{visibility_map: %{hiv: "public"}})
             |> json_response(422)

    seen = v.c |> recycle_authed() |> get("/v1/profiles/#{o.pid}") |> json_response(200)
    assert seen["fields"]["position"] == "vers"
    assert seen["fields"]["prep"] == "on"

    u = onboarded(conn, verified: false)

    Thirstr.Repo.query!(
      "UPDATE accounts SET settings = '{\"hide_from_unverified\": false}' WHERE id = (SELECT account_id FROM profiles WHERE id = $1)",
      [Ecto.UUID.dump!(o.pid)]
    )

    stranger = u.c |> recycle_authed() |> get("/v1/profiles/#{o.pid}") |> json_response(200)
    assert stranger["fields"] == %{"bio" => "Climber, coffee"}
  end

  test "chats/only_me values are never stored server-side (R-06.4)", %{other: o} do
    p =
      o.c
      |> recycle_authed()
      |> patch("/v1/me/profiles/#{o.pid}", %{
        fields: %{hiv: "neg", position: "top"},
        visibility_map: %{position: "only_me"}
      })
      |> json_response(200)

    refute Map.has_key?(p["fields"], "hiv")
    refute Map.has_key?(p["fields"], "position")
  end

  test "bio: no phone/email; links blocked for new accounts (R-06.12)", %{other: o} do
    for bio <- ["call +41 79 123 45 67", "me@example.com", "see www.example.com"] do
      assert o.c
             |> recycle_authed()
             |> patch("/v1/me/profiles/#{o.pid}", %{fields: %{bio: bio}})
             |> json_response(422)
    end
  end

  test "Sport and Friends profiles are separate and unlinkable; sport mode never shows Now profiles (AC-11.2)",
       %{viewer: v, other: o} do
    sp =
      o.c |> recycle_authed() |> post("/v1/me/profiles", %{kind: "sport"}) |> json_response(201)

    assert sp["kind"] == "sport" and sp["id"] != o.pid

    assert o.c
           |> recycle_authed()
           |> post("/v1/me/profiles", %{kind: "sport"})
           |> json_response(409)

    assert o.c
           |> recycle_authed()
           |> patch("/v1/me/profiles/#{sp["id"]}", %{fields: %{position: "top"}})
           |> json_response(422)

    res = v.c |> recycle_authed() |> get("/v1/explore/grid?mode=sport") |> json_response(200)
    refute o.pid in ids(res["items"])
    # no photo yet → not visible (R-06.2)
    refute sp["id"] in ids(res["items"])
  end

  @tag ac: "AC-09.2"
  test "Now status: verified only, shows on cards, sorted first", %{
    viewer: v,
    other: o,
    conn: conn
  } do
    assert %{"status" => "door_open"} =
             o.c
             |> recycle_authed()
             |> put("/v1/me/now", %{status: "door_open", text: "Come by", ttl_s: 3600})
             |> json_response(200)

    [first | _] = grid(v.c)["items"]
    assert first["id"] == o.pid and first["now"]["status"] == "door_open"

    u = onboarded(conn, verified: false)

    assert u.c
           |> recycle_authed()
           |> put("/v1/me/now", %{status: "now", ttl_s: 3600})
           |> json_response(403)
  end

  test "filters: age range and settings hide_from age (R-04.8, R-17.7)", %{viewer: v, other: o} do
    assert o.pid in ids(grid(v.c, "&age_min=18&age_max=40")["items"])
    refute o.pid in ids(grid(v.c, "&age_min=40")["items"])

    o.c
    |> recycle_authed()
    |> patch("/v1/me/settings", %{hide_from_age_min: 40})
    |> json_response(200)

    refute o.pid in ids(grid(v.c)["items"])
  end

  test "Safe Mode targets are invisible to accounts younger than 7 days (F-14)", %{
    viewer: v,
    other: o
  } do
    o.c
    |> recycle_authed()
    |> put("/v1/me/safe_mode", %{setting: "auto", active: true})
    |> json_response(200)

    refute o.pid in ids(grid(v.c)["items"])

    Thirstr.Repo.query!(
      "UPDATE accounts SET inserted_at = now() - interval '30 days' WHERE id = (SELECT account_id FROM profiles WHERE id = $1)",
      [Ecto.UUID.dump!(v.pid)]
    )

    assert o.pid in ids(grid(v.c)["items"])
  end

  test "k-anonymity: sparse cells display at r7 (R-05.2)", %{other: o} do
    Thirstr.Location.refresh_k_anonymity()

    %{rows: [[res]]} =
      Thirstr.Repo.query!("SELECT display_res FROM location_cells WHERE profile_id = $1", [
        Ecto.UUID.dump!(o.pid)
      ])

    assert res == 7
  end

  test "photos: reorder keeps an accepted main first, delete works", %{other: o} do
    up =
      o.c
      |> recycle_authed()
      |> post("/v1/me/profiles/#{o.pid}/photos", %{slot: 1})
      |> json_response(201)

    p =
      o.c
      |> recycle_authed()
      |> post("/v1/me/profiles/#{o.pid}/photos/#{up["photo_id"]}/check")
      |> json_response(200)

    assert p["photo"]["status"] == "ok_public"
    me = o.c |> recycle_authed() |> get("/v1/me") |> json_response(200)
    [main, second] = Enum.map(me["profile"]["photos"], & &1["id"])

    assert o.c
           |> recycle_authed()
           |> put("/v1/me/profiles/#{o.pid}/photos/order", %{order: [second, main]})
           |> json_response(200)

    p =
      o.c
      |> recycle_authed()
      |> delete("/v1/me/profiles/#{o.pid}/photos/#{main}")
      |> json_response(200)

    assert length(p["photos"]) == 1
  end

  test "tile style served without auth", %{conn: conn} do
    style = conn |> get("/v1/tiles/style.json") |> json_response(200)
    assert style["version"] == 8
    assert hd(style["sources"]["omt"]["tiles"]) =~ "/v1/tiles/v/"
  end

  test "profile view cap returns 429 above 300/hour (D-09)", %{viewer: v, other: o} do
    Application.put_env(:thirstr, :rate_limit_multiplier, 1)
    on_exit(fn -> Application.put_env(:thirstr, :rate_limit_multiplier, 100) end)
    Thirstr.Valkey.command!(["SET", "rl:#{account_of(v.pid).id}:views", "300", "EX", "3600"])
    assert v.c |> recycle_authed() |> get("/v1/profiles/#{o.pid}") |> json_response(429)
  end
end
