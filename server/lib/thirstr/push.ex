defmodule Thirstr.Push do
  @moduledoc """
  F-16 content-free pushes (AC-16.1). The payload never carries names, text or images: a fixed
  generic alert plus an opaque token; the app fetches and renders details locally (R-16.1).
  Per-type toggles and quiet hours are applied here because the server knows only the event
  type (R-16.2, R-16.4). Safe Mode uses the neutral "Reminder" wording (R-16.3).
  """
  alias Thirstr.{Repo, Settings, Valkey}
  alias Thirstr.Accounts.Account

  # event => {settings toggle, bypasses quiet hours?}
  @types %{
    "message.new" => {"message", false},
    "tap.new" => {"tap", false},
    "tap.mutual" => {"mutual", false},
    "party.request" => {"party_request", false},
    "party.accepted" => {"party_accepted", false},
    "party.status" => {"party_accepted", false},
    "activity.join" => {"activity_join", false},
    "club.request" => {"club_event", false},
    "checkin.due" => {"checkin", true},
    "checkin.alert" => {"checkin_alert", true}
  }

  def types, do: @types

  def register(device_id, token, platform) do
    cond do
      platform not in ~w(ios android) ->
        {:error, {:validation, %{platform: ["ios or android"]}}}

      not (is_binary(token) and Regex.match?(~r/^[0-9a-fA-F]{32,200}$/, token)) ->
        {:error, {:validation, %{token: ["invalid"]}}}

      true ->
        Repo.query!(
          "UPDATE devices SET push_token = $1, push_platform = $2 WHERE id = $3",
          [String.downcase(token), platform, Ecto.UUID.dump!(device_id)]
        )

        :ok
    end
  end

  @doc "Called by Notify for every event; throttled to one wake per account per 20 s (R-16.5)."
  def maybe_wake(account_id, event) do
    case Map.get(@types, event) do
      nil ->
        :ok

      _ ->
        if Valkey.command!(["SET", "pushq:" <> account_id, "1", "NX", "EX", "20"]) == "OK" do
          %{account_id: account_id, event: event}
          |> Thirstr.Jobs.PushWake.new()
          |> Oban.insert()
        end

        :ok
    end
  end

  @doc "Sends the wake to every device of the account with a token, unless toggled off."
  def deliver(account_id, event) do
    with %Account{} = a <- Repo.get(Account, account_id),
         true <- wanted?(a, event) do
      safe = Account.safe_mode_on?(a)

      Repo.query!(
        "SELECT push_token, push_platform FROM devices WHERE account_id = $1 AND push_token IS NOT NULL",
        [Ecto.UUID.dump!(account_id)]
      ).rows
      |> Enum.each(fn [token, "ios"] -> send_apns(token, payload(safe)) end)
    end

    :ok
  end

  defp wanted?(a, event) do
    {toggle, urgent} = Map.fetch!(@types, event)
    s = Settings.get(a)

    Map.get(s["push"] || %{}, toggle, true) and (urgent or not quiet?(s["quiet_hours"]))
  end

  defp quiet?(%{"from" => f, "to" => t, "tz_offset_min" => o}) do
    h = DateTime.utc_now() |> DateTime.add(o * 60, :second) |> Map.get(:hour)
    if f <= t, do: h >= f and h < t, else: h >= f or h < t
  end

  defp quiet?(_), do: false

  @doc "The only payload shape the server sends (api.md › Push payloads)."
  def payload(safe_mode?) do
    {title, body} =
      if safe_mode?, do: {"Reminder", "You have a reminder"}, else: {"Thirstr", "New activity"}

    %{
      "aps" => %{
        "alert" => %{"title" => title, "body" => body},
        "sound" => "default",
        "mutable-content" => 1
      },
      "t" => Base.url_encode64(:crypto.strong_rand_bytes(12), padding: false)
    }
  end

  defp send_apns(token, payload) do
    cfg = Application.get_env(:thirstr, :apns, [])

    cond do
      cfg[:mock_url] ->
        Req.post(cfg[:mock_url], json: payload, retry: false)

      cfg[:key_p8] && cfg[:key_id] && cfg[:team_id] ->
        Req.post("#{cfg[:host]}/3/device/#{token}",
          json: payload,
          headers: [
            {"authorization", "bearer " <> jwt(cfg)},
            {"apns-topic", cfg[:topic]},
            {"apns-push-type", "alert"},
            {"apns-priority", "10"},
            {"apns-collapse-id", "thirstr"}
          ],
          connect_options: [protocols: [:http2]],
          retry: false
        )
        |> handle_apns(token)

      true ->
        :skipped
    end
  end

  # 410 Unregistered / 400 BadDeviceToken → forget the token.
  defp handle_apns({:ok, %{status: s}}, token) when s in [400, 410] do
    Repo.query!("UPDATE devices SET push_token = NULL WHERE push_token = $1", [token])
  end

  defp handle_apns(res, _), do: res

  # Provider token, reused for 40 min (Apple: refresh between 20 and 60 min).
  defp jwt(cfg) do
    now = System.system_time(:second)

    case :persistent_term.get({__MODULE__, :jwt}, nil) do
      {tok, at} when now - at < 2400 ->
        tok

      _ ->
        jwk = JOSE.JWK.from_pem(String.replace(cfg[:key_p8], "\\n", "\n"))

        {_, tok} =
          JOSE.JWT.sign(jwk, %{"alg" => "ES256", "kid" => cfg[:key_id]}, %{
            "iss" => cfg[:team_id],
            "iat" => now
          })
          |> JOSE.JWS.compact()

        :persistent_term.put({__MODULE__, :jwt}, {tok, now})
        tok
    end
  end
end
