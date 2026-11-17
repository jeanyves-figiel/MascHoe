defmodule ThirstrWeb.ChatTest do
  use ThirstrWeb.ConnCase, async: false
  use Oban.Testing, repo: Thirstr.Repo
  import Phoenix.ChannelTest, except: [connect: 2, push: 3]
  require Phoenix.ChannelTest

  # B2: F-07 MLS delivery service, F-08 blobs, F-16 push.
  setup %{conn: conn} do
    alice = onboarded(conn)
    bob = onboarded(conn, basics: [display_name: "Bob"])
    {:ok, alice: Map.put(alice, :dev, device_of(alice)), bob: Map.put(bob, :dev, device_of(bob))}
  end

  defp device_of(%{pid: pid}) do
    %{rows: [[d]]} =
      Thirstr.Repo.query!(
        "SELECT d.id::text FROM devices d JOIN profiles p ON p.account_id = d.account_id WHERE p.id = $1 LIMIT 1",
        [Ecto.UUID.dump!(pid)]
      )

    d
  end

  defp b64(s), do: Base.encode64(s)

  defp upload(u, n, lr \\ "LR") do
    u.c
    |> recycle_authed()
    |> post("/v1/mls/keypackages", %{
      profile_id: u.pid,
      key_packages: Enum.map(1..n, &b64("kp-#{u.pid}-#{&1}")),
      last_resort: lr && b64(lr <> u.pid)
    })
  end

  defp claim(from, to),
    do:
      from.c
      |> recycle_authed()
      |> post("/v1/mls/keypackages/claim", %{from_profile_id: from.pid, to_profile_id: to.pid})

  defp send_msg(from, to, kind \\ "app", ct \\ "ciphertext") do
    from.c
    |> recycle_authed()
    |> post("/v1/mls/messages", %{
      from_profile_id: from.pid,
      group_id: b64("group-1"),
      franking_tag: b64(:crypto.strong_rand_bytes(32)),
      envelopes: [
        %{to_profile_id: to.pid, to_device_id: to.dev, kind: kind, ciphertext: b64(ct)}
      ]
    })
  end

  defp pull(u), do: u.c |> recycle_authed() |> get("/v1/mls/messages") |> json_response(200)

  test "key packages: single-use consumed, last resort reused", %{alice: a, bob: b} do
    assert %{"counts" => counts} = upload(b, 1) |> json_response(200)
    assert counts[b.pid] == %{"count" => 1, "last_resort" => true}

    [k1] = claim(a, b) |> json_response(200) |> Map.fetch!("key_packages")
    assert Base.decode64!(k1["key_package"]) == "kp-#{b.pid}-1"
    assert k1["device_id"] == b.dev

    [k2] = claim(a, b) |> json_response(200) |> Map.fetch!("key_packages")
    assert Base.decode64!(k2["key_package"]) == "LR" <> b.pid
    [k3] = claim(a, b) |> json_response(200) |> Map.fetch!("key_packages")
    assert k3["key_package"] == k2["key_package"]
  end

  test "no key packages → unavailable", %{alice: a, bob: b} do
    assert claim(a, b) |> json_response(409)
  end

  @tag ac: "AC-07.1"
  test "send → pull → ack; server stores only ciphertext and deletes on ack", %{alice: a, bob: b} do
    assert %{"delivered" => [pid]} = send_msg(a, b) |> json_response(200)
    assert pid == b.pid
    [m] = pull(b)["messages"]
    assert Base.decode64!(m["ciphertext"]) == "ciphertext"
    assert m["from_profile_id"] == a.pid
    assert pull(a)["messages"] == []

    b.c
    |> recycle_authed()
    |> post("/v1/mls/messages/ack", %{ids: [m["id"]]})
    |> json_response(200)

    assert pull(b)["messages"] == []
  end

  @tag ac: "R-07.2"
  test "unverified can't start a chat but can reply", %{conn: conn, alice: a} do
    u = onboarded(conn, verified: false, basics: [display_name: "New"])
    u = Map.put(u, :dev, device_of(u))
    upload(u, 1)
    upload(a, 1)

    assert claim(u, a) |> json_response(403)
    assert send_msg(u, a) |> json_response(403)

    assert send_msg(a, u) |> json_response(200)
    assert claim(u, a) |> json_response(200)
    assert %{"delivered" => [_]} = send_msg(u, a) |> json_response(200)
  end

  test "blocked recipient: dropped without saying why", %{alice: a, bob: b} do
    b.c |> recycle_authed() |> post("/v1/profiles/#{a.pid}/block") |> response(204)
    assert %{"delivered" => [], "undelivered" => [_]} = send_msg(a, b) |> json_response(200)
    assert pull(b)["messages"] == []
    assert claim(a, b) |> json_response(404)
  end

  test "envelope device must belong to the recipient", %{alice: a, bob: b} do
    res =
      a.c
      |> recycle_authed()
      |> post("/v1/mls/messages", %{
        from_profile_id: a.pid,
        group_id: b64("g"),
        envelopes: [
          %{to_profile_id: b.pid, to_device_id: a.dev, kind: "app", ciphertext: b64("x")}
        ]
      })

    assert json_response(res, 422)
  end

  test "media blob: upload slot + signed GET, owner can delete", %{alice: a, bob: b} do
    %{"blob_id" => id, "put_url" => put} =
      a.c |> recycle_authed() |> post("/v1/media/upload", %{size: 1000}) |> json_response(201)

    assert put =~ "blob/"
    assert %{"url" => _} = b.c |> recycle_authed() |> get("/v1/media/#{id}") |> json_response(200)
    assert b.c |> recycle_authed() |> delete("/v1/media/#{id}") |> json_response(404)
    assert a.c |> recycle_authed() |> delete("/v1/media/#{id}") |> response(204)
    assert b.c |> recycle_authed() |> get("/v1/media/#{id}") |> json_response(404)
  end

  @tag ac: "AC-16.1"
  test "push: token registered, payload is content-free, wake job enqueued", %{alice: a, bob: b} do
    b.c
    |> recycle_authed()
    |> put("/v1/me/push", %{token: String.duplicate("ab", 32), platform: "ios"})
    |> response(204)

    Thirstr.Valkey.command!(["DEL", "pushq:" <> account_of(b.pid).id])
    send_msg(a, b) |> json_response(200)
    assert_enqueued(worker: Thirstr.Jobs.PushWake, args: %{event: "message.new"})

    p = Thirstr.Push.payload(false)
    assert Map.keys(p) |> Enum.sort() == ["aps", "t"]
    refute Jason.encode!(p) =~ "Bob"
    assert Thirstr.Push.payload(true)["aps"]["alert"]["title"] == "Reminder"
  end

  test "socket: typing relayed, message.new pushed", %{alice: a, bob: b} do
    {:ok, b_access} = access_of(b)
    {:ok, socket} = Phoenix.ChannelTest.connect(ThirstrWeb.UserSocket, %{"token" => b_access})
    {:ok, _, _} = subscribe_and_join(socket, ThirstrWeb.UserChannel, "user:me")

    send_msg(a, b) |> json_response(200)
    assert_push "message.new", %{}

    {:ok, a_access} = access_of(a)
    {:ok, s2} = Phoenix.ChannelTest.connect(ThirstrWeb.UserSocket, %{"token" => a_access})
    {:ok, _, ach} = subscribe_and_join(s2, ThirstrWeb.UserChannel, "user:me")

    Phoenix.ChannelTest.push(ach, "typing", %{
      "from_profile_id" => a.pid,
      "to_profile_id" => b.pid
    })

    assert_push "typing", %{from_profile_id: _}
  end

  defp access_of(u) do
    [auth] = Plug.Conn.get_req_header(u.c, "authorization")
    {:ok, String.replace_prefix(auth, "Bearer ", "")}
  end
end
