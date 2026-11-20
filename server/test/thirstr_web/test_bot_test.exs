defmodule ThirstrWeb.TestBotTest do
  use ThirstrWeb.ConnCase, async: false

  # testing.md › Chat test bot (#109)
  @key "test-bot-key-0123456789abcdef"

  setup do
    prev = Application.get_env(:thirstr, :testbot_key)
    on_exit(fn -> Application.put_env(:thirstr, :testbot_key, prev) end)
    :ok
  end

  defp session(conn, key) do
    conn
    |> put_req_header("x-testbot-key", key)
    |> post("/v1/testbot/session", %{})
  end

  test "off without a key: 404", %{conn: conn} do
    Application.put_env(:thirstr, :testbot_key, nil)
    assert conn |> session(@key) |> json_response(404)
  end

  test "wrong key: 404", %{conn: conn} do
    Application.put_env(:thirstr, :testbot_key, @key)
    assert conn |> session("nope-nope-nope-nope-nope-nope") |> json_response(404)
  end

  test "never on in production", %{conn: conn} do
    Application.put_env(:thirstr, :testbot_key, @key)
    System.put_env("DEPLOY_ENV", "prod")
    on_exit(fn -> System.delete_env("DEPLOY_ENV") end)
    assert conn |> session(@key) |> json_response(404)
  end

  test "session: verified bot near Altstetten, visible in Explore, one device", %{conn: conn} do
    Application.put_env(:thirstr, :testbot_key, @key)
    s1 = conn |> session(@key) |> json_response(200)
    s2 = build_conn() |> session(@key) |> json_response(200)
    assert s1["profile_id"] == s2["profile_id"]

    %{rows: [[n_acc, n_dev]]} =
      Thirstr.Repo.query!("""
      SELECT (SELECT count(*) FROM accounts WHERE test_bot),
             (SELECT count(*) FROM devices d JOIN accounts a ON a.id = d.account_id WHERE a.test_bot)
      """)

    assert {n_acc, n_dev} == {1, 1}

    # the bot's own session works; the old one is gone
    bot = authed(build_conn(), s2["access_token"])
    me = bot |> get("/v1/me") |> json_response(200)
    assert me["verified"]
    assert me["profile"]["display_name"] =~ "Testbot"
    assert authed(build_conn(), s1["access_token"]) |> get("/v1/me") |> json_response(401)

    # a tester in Zurich sees it and can open its profile
    u = onboarded(build_conn())
    grid = u.c |> recycle_authed() |> get("/v1/explore/grid?mode=hookup") |> json_response(200)
    assert Enum.any?(grid["items"] || grid["profiles"] || [], &(&1["id"] == s2["profile_id"]))

    bot_pid = s2["profile_id"]
    view = u.c |> recycle_authed() |> get("/v1/profiles/#{bot_pid}") |> json_response(200)
    assert view["verified"]
  end
end
