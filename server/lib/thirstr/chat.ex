defmodule Thirstr.Chat do
  @moduledoc """
  MLS Delivery Service (F-07, RFC 9420 §16) and E2EE media blobs (F-08).

  The server routes opaque ciphertext between (profile, device) pairs. It never sees plaintext
  (AC-07.1): groups, membership changes and message contents are MLS handshake/application
  messages built on the device. Server-side rules are the ones that need no content:
  blocks, verification for first contact (R-07.2), rate limits, retention (R-07.12).
  """
  import Ecto.Query
  alias Thirstr.{Notify, Repo, Social, Storage}
  alias Thirstr.Accounts.Account

  @max_ct 256 * 1024
  @kp_cap 200
  @retention_d 30
  @new_contact_per_h 30
  @kinds ~w(welcome commit app)

  # ------------------------------------------------------------------ key packages

  @doc "Device uploads key packages for one of its profiles (R-07 edge case: top-up each launch)."
  def upload_key_packages(%Account{} = a, device_id, %{"profile_id" => pid} = params) do
    packages = List.wrap(params["key_packages"])
    last_resort = params["last_resort"]

    with {:ok, _} <- own_profile(a, pid),
         {:ok, kps} <- decode_all(packages),
         {:ok, lr} <- decode_opt(last_resort),
         :ok <- cap_check(pid, device_id, length(kps)) do
      now = DateTime.utc_now()
      rows = Enum.map(kps, &kp_row(pid, device_id, &1, false, now))
      Repo.insert_all("mls_key_packages", rows)

      if lr do
        Repo.query!(
          "DELETE FROM mls_key_packages WHERE profile_id = $1 AND device_id = $2 AND last_resort",
          [dump(pid), dump(device_id)]
        )

        Repo.insert_all("mls_key_packages", [kp_row(pid, device_id, lr, true, now)])
      end

      {:ok, key_package_counts(a, device_id)}
    end
  end

  def upload_key_packages(_, _, _),
    do: {:error, {:validation, %{profile_id: ["can't be blank"]}}}

  defp kp_row(pid, device_id, bin, last_resort, now),
    do: %{
      profile_id: dump(pid),
      device_id: dump(device_id),
      key_package: bin,
      last_resort: last_resort,
      created_at: now
    }

  defp cap_check(pid, device_id, n) do
    %{rows: [[c]]} =
      Repo.query!(
        "SELECT count(*) FROM mls_key_packages WHERE profile_id = $1 AND device_id = $2 AND NOT last_resort",
        [dump(pid), dump(device_id)]
      )

    if c + n <= @kp_cap,
      do: :ok,
      else: {:error, {:validation, %{key_packages: ["max #{@kp_cap} per device"]}}}
  end

  @doc "Unused key packages per own profile on this device: %{profile_id => count}."
  def key_package_counts(%Account{} = a, device_id) do
    Repo.query!(
      """
      SELECT p.id::text, count(k.id) FILTER (WHERE NOT k.last_resort), bool_or(k.last_resort)
      FROM profiles p LEFT JOIN mls_key_packages k ON k.profile_id = p.id AND k.device_id = $2
      WHERE p.account_id = $1 GROUP BY p.id
      """,
      [dump(a.id), dump(device_id)]
    ).rows
    |> Map.new(fn [pid, c, lr] -> {pid, %{count: c, last_resort: lr == true}} end)
  end

  @doc """
  Claims one key package per device of `to_profile` so `from_profile` can add it to a group.
  Single-use packages are deleted; the last-resort one is reused (RFC 9420 §16.8).
  """
  def claim_key_packages(%Account{} = a, from_pid, to_pid) do
    with {:ok, _} <- own_profile(a, from_pid),
         {:ok, t} <- Social.target(a, to_pid),
         :ok <- first_contact_ok(a, from_pid, to_pid) do
      devices =
        Repo.query!(
          "SELECT DISTINCT device_id FROM mls_key_packages WHERE profile_id = $1",
          [dump(t.id)]
        ).rows

      kps =
        Enum.flat_map(devices, fn [d] ->
          case claim_one(t.id, d) do
            nil -> []
            kp -> [kp]
          end
        end)

      if kps == [],
        do: {:error, {:unavailable, "This profile can't receive messages yet"}},
        else: {:ok, kps}
    end
  end

  defp claim_one(pid, device) do
    Repo.transaction(fn ->
      case Repo.query!(
             """
             SELECT id, key_package, last_resort FROM mls_key_packages
             WHERE profile_id = $1 AND device_id = $2
             ORDER BY last_resort, id LIMIT 1 FOR UPDATE SKIP LOCKED
             """,
             [dump(pid), device]
           ).rows do
        [[id, kp, lr]] ->
          unless lr, do: Repo.query!("DELETE FROM mls_key_packages WHERE id = $1", [id])

          %{
            id: id,
            device_id: Ecto.UUID.cast!(device),
            key_package: Base.encode64(kp)
          }

        [] ->
          nil
      end
    end)
    |> elem(1)
  end

  # R-07.2: starting a chat needs a verified sender, unless the other side wrote first.
  defp first_contact_ok(%Account{} = a, from_pid, to_pid) do
    cond do
      replied_to?(from_pid, to_pid) -> :ok
      Account.verified?(a) -> :ok
      true -> {:error, {:not_verified, "Verify to send the first message"}}
    end
  end

  @doc "Has `other` ever sent to `me`? (inbound contact)"
  def replied_to?(me, other) do
    Repo.query!(
      """
      SELECT 1 FROM contacts WHERE
        (profile_a = $1 AND profile_b = $2 AND b_sent > 0) OR
        (profile_a = $2 AND profile_b = $1 AND a_sent > 0)
      """,
      [dump(me), dump(other)]
    ).num_rows > 0
  end

  # ------------------------------------------------------------------ messages

  @doc """
  POST /mls/messages. `envelopes` = [{to_profile_id, to_device_id, kind, key_package_id?,
  ciphertext}]. Blocked or gone recipients are dropped without saying why (F-07 edge case).
  """
  def send(%Account{} = a, device_id, params) do
    from = params["from_profile_id"]
    envs = List.wrap(params["envelopes"])

    with {:ok, _} <- own_profile(a, from),
         {:ok, group} <- decode_b64(params["group_id"], 64, :group_id),
         {:ok, envs} <- validate_envelopes(envs),
         {:ok, _} <- Social.limit(a, "msg", 600, 3600) do
      now = DateTime.utc_now()

      {delivered, undelivered} =
        envs
        |> Enum.group_by(& &1.to_profile_id)
        |> Enum.reduce({[], []}, fn {to, list}, {ok, ko} ->
          case deliver(a, device_id, from, to, group, list, now, params) do
            :ok -> {[to | ok], ko}
            :dropped -> {ok, [to | ko]}
            {:error, _} = e -> throw(e)
          end
        end)

      {:ok, %{delivered: delivered, undelivered: undelivered}}
    end
  catch
    {:error, _} = e -> e
  end

  defp deliver(a, _device_id, from, to, group, envs, now, params) do
    case Social.target(a, to) do
      {:ok, t} ->
        app? = Enum.any?(envs, &(&1.kind == "app"))

        with :ok <- if(app?, do: new_contact_check(a, from, to), else: :ok),
             :ok <- devices_belong(envs, t.account_id) do
          rows =
            Enum.map(envs, fn e ->
              %{
                to_profile_id: dump(to),
                to_device_id: dump(e.to_device_id),
                from_profile_id: dump(from),
                group_id: group,
                kind: e.kind,
                key_package_id: e.key_package_id,
                ciphertext: e.ciphertext,
                created_at: now
              }
            end)

          Repo.insert_all("mls_messages", rows)
          if app?, do: count_contact(from, to, now)
          store_franking(params["franking_tag"], from, to, now)
          Notify.event(t.account_id, "message.new", %{})
          :ok
        end

      _ ->
        :dropped
    end
  end

  # R-07.2 + api.md rate limit: new contacts 30/h, unverified 0 (unless replying).
  defp new_contact_check(a, from, to) do
    cond do
      replied_to?(from, to) or sent_before?(from, to) -> :ok
      not Account.verified?(a) -> {:error, {:not_verified, "Verify to send the first message"}}
      true -> with {:ok, _} <- Social.limit(a, "newc", @new_contact_per_h, 3600), do: :ok
    end
  end

  defp sent_before?(from, to) do
    Repo.query!(
      """
      SELECT 1 FROM contacts WHERE
        (profile_a = $1 AND profile_b = $2 AND a_sent > 0) OR
        (profile_a = $2 AND profile_b = $1 AND b_sent > 0)
      """,
      [dump(from), dump(to)]
    ).num_rows > 0
  end

  defp devices_belong(envs, account_id) do
    ids = envs |> Enum.map(&dump(&1.to_device_id)) |> Enum.uniq()

    %{rows: [[n]]} =
      Repo.query!(
        "SELECT count(*) FROM devices WHERE id = ANY($1) AND account_id = $2",
        [ids, dump(account_id)]
      )

    if n == length(ids),
      do: :ok,
      else: {:error, {:validation, %{to_device_id: ["unknown device"]}}}
  end

  # Contact pair is stored ordered (profile_a < profile_b); the increments are bound params.
  defp count_contact(from, to, now) do
    {a, b, da, db} = if from < to, do: {from, to, 1, 0}, else: {to, from, 0, 1}

    Repo.query!(
      """
      INSERT INTO contacts (profile_a, profile_b, a_sent, b_sent, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $5)
      ON CONFLICT (profile_a, profile_b) DO UPDATE
        SET a_sent = contacts.a_sent + $3, b_sent = contacts.b_sent + $4, updated_at = $5
      """,
      [dump(a), dump(b), da, db, now]
    )
  end

  defp store_franking(nil, _, _, _), do: :ok

  defp store_franking(tag, from, to, now) do
    case decode_b64(tag, 64, :franking_tag) do
      {:ok, t} ->
        Repo.query!(
          "INSERT INTO franking_tags (tag, from_profile_id, to_profile_id, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
          [t, dump(from), dump(to), now]
        )

      _ ->
        :ok
    end
  end

  defp validate_envelopes([]), do: {:error, {:validation, %{envelopes: ["can't be empty"]}}}

  defp validate_envelopes(envs) when length(envs) <= 200 do
    Enum.reduce_while(envs, {:ok, []}, fn e, {:ok, acc} ->
      with %{} <- e,
           {:ok, _} <- Ecto.UUID.cast(e["to_profile_id"]),
           {:ok, _} <- Ecto.UUID.cast(e["to_device_id"]),
           true <- e["kind"] in @kinds,
           {:ok, ct} <- decode_b64(e["ciphertext"], @max_ct, :ciphertext) do
        {:cont,
         {:ok,
          [
            %{
              to_profile_id: e["to_profile_id"],
              to_device_id: e["to_device_id"],
              kind: e["kind"],
              key_package_id: if(is_integer(e["key_package_id"]), do: e["key_package_id"]),
              ciphertext: ct
            }
            | acc
          ]}}
      else
        {:error, _} = err -> {:halt, err}
        _ -> {:halt, {:error, {:validation, %{envelopes: ["invalid envelope"]}}}}
      end
    end)
    |> case do
      {:ok, l} -> {:ok, Enum.reverse(l)}
      e -> e
    end
  end

  defp validate_envelopes(_), do: {:error, {:validation, %{envelopes: ["max 200"]}}}

  @doc "Pending ciphertext for this device (fallback pull; realtime only says 'something new')."
  def pull(%Account{} = a, device_id, after_id) do
    Repo.query!(
      """
      SELECT m.id, m.to_profile_id::text, m.from_profile_id::text, m.group_id, m.kind,
             m.key_package_id, m.ciphertext, m.created_at
      FROM mls_messages m JOIN profiles p ON p.id = m.to_profile_id
      WHERE m.to_device_id = $1 AND p.account_id = $2 AND m.id > $3
      ORDER BY m.id LIMIT 200
      """,
      [dump(device_id), dump(a.id), after_id || 0]
    ).rows
    |> Enum.map(fn [id, to, from, g, kind, kp, ct, at] ->
      %{
        id: id,
        to_profile_id: to,
        from_profile_id: from,
        group_id: Base.encode64(g),
        kind: kind,
        key_package_id: kp,
        ciphertext: Base.encode64(ct),
        at: Thirstr.Explore.utc_any(at)
      }
    end)
  end

  @doc "Device acknowledges processed messages; the server deletes them (R-07.12)."
  def ack(%Account{}, device_id, ids) when is_list(ids) do
    ids = Enum.filter(ids, &is_integer/1)

    {n, _} =
      from(m in "mls_messages",
        where: m.id in ^ids and m.to_device_id == type(^device_id, :binary_id)
      )
      |> Repo.delete_all()

    {:ok, n}
  end

  def ack(_, _, _), do: {:error, {:validation, %{ids: ["must be a list"]}}}

  # ------------------------------------------------------------------ media blobs (F-08)

  @max_blob 210 * 1024 * 1024

  @doc "Upload slot for an encrypted blob (R-08.2). Chat media expiry ≤ 30 d; album items kept."
  def create_blob(%Account{} = a, params) do
    size = params["size"]
    # Chat media ≤ 30 d (R-08.10); private-album items live until the owner deletes them (R-08.4).
    max_ttl = if params["album"] == true, do: 10 * 365 * 86_400, else: @retention_d * 86_400
    ttl = min(params["ttl_s"] || max_ttl, max_ttl)

    with true <-
           (is_integer(size) and size > 0 and size <= @max_blob) ||
             {:error, {:validation, %{size: ["1 B – 210 MB"]}}},
         true <- (is_integer(ttl) and ttl > 0) || {:error, {:validation, %{ttl_s: ["invalid"]}}},
         {:ok, _} <- Social.limit(a, "blob", 300, 3600) do
      id = Ecto.UUID.generate()
      key = "blob/#{id}"
      now = DateTime.utc_now()

      Repo.insert_all("media_blobs", [
        %{
          id: dump(id),
          account_id: dump(a.id),
          storage_key: key,
          size: size,
          expires_at: DateTime.add(now, ttl, :second),
          created_at: now
        }
      ])

      {:ok, put_url} = Storage.presigned_put(key, "application/octet-stream")
      {:ok, %{blob_id: id, put_url: put_url}}
    end
  end

  @doc "Signed GET for a blob. Ids are random and only travel inside E2EE messages."
  def blob_url(id) do
    with {:ok, _} <- Ecto.UUID.cast(id),
         %{rows: [[key]]} <-
           Repo.query!(
             "SELECT storage_key FROM media_blobs WHERE id = $1 AND expires_at > now()",
             [dump(id)]
           ) do
      {:ok, %{url: Storage.presigned_get(key)}}
    else
      _ -> {:error, :not_found}
    end
  end

  @doc "Sender deletes a blob early (view-once after all acks, unsend)."
  def delete_blob(%Account{} = a, id) do
    with {:ok, _} <- Ecto.UUID.cast(id),
         %{rows: [[key]]} <-
           Repo.query!(
             "DELETE FROM media_blobs WHERE id = $1 AND account_id = $2 RETURNING storage_key",
             [dump(id), dump(a.id)]
           ) do
      Storage.delete_many([key])
      :ok
    else
      _ -> {:error, :not_found}
    end
  end

  @doc "Retention sweep (R-07.12, R-08.10)."
  def sweep do
    Repo.query!(
      "DELETE FROM mls_messages WHERE created_at < now() - make_interval(days => $1)",
      [@retention_d]
    )

    Repo.query!("DELETE FROM franking_tags WHERE created_at < now() - interval '90 days'")

    keys =
      Repo.query!("DELETE FROM media_blobs WHERE expires_at < now() RETURNING storage_key").rows
      |> List.flatten()

    Storage.delete_many(keys)
    :ok
  end

  # ------------------------------------------------------------------ helpers

  def own_profile(%Account{} = a, pid) do
    with {:ok, _} <- Ecto.UUID.cast(pid || ""),
         %{rows: [[id]]} <-
           Repo.query!("SELECT id::text FROM profiles WHERE id = $1 AND account_id = $2", [
             dump(pid),
             dump(a.id)
           ]) do
      {:ok, id}
    else
      _ -> {:error, :not_found}
    end
  end

  defp decode_all(list) when length(list) <= 100 do
    Enum.reduce_while(list, {:ok, []}, fn b, {:ok, acc} ->
      case decode_b64(b, 4096, :key_packages) do
        {:ok, bin} -> {:cont, {:ok, [bin | acc]}}
        e -> {:halt, e}
      end
    end)
  end

  defp decode_all(_), do: {:error, {:validation, %{key_packages: ["max 100 per upload"]}}}

  defp decode_opt(nil), do: {:ok, nil}
  defp decode_opt(b), do: decode_b64(b, 4096, :last_resort)

  defp decode_b64(s, max, field) when is_binary(s) do
    case Base.decode64(s) do
      {:ok, bin} when byte_size(bin) > 0 and byte_size(bin) <= max -> {:ok, bin}
      _ -> {:error, {:validation, %{field => ["invalid"]}}}
    end
  end

  defp decode_b64(_, _, field), do: {:error, {:validation, %{field => ["required"]}}}

  defp dump(uuid), do: Ecto.UUID.dump!(uuid)
end
