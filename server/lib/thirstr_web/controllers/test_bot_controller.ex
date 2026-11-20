defmodule ThirstrWeb.TestBotController do
  @moduledoc "POST /v1/testbot/session (testing.md › Chat test bot): staging only, `x-testbot-key`."
  use ThirstrWeb, :controller
  alias Thirstr.TestBot

  action_fallback ThirstrWeb.FallbackController

  def session(conn, _params) do
    if TestBot.key_ok?(conn |> get_req_header("x-testbot-key") |> List.first()) do
      s = TestBot.session!()

      json(conn, %{
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        expires_in: s.expires_in,
        profile_id: s.profile_id
      })
    else
      {:error, :not_found}
    end
  end
end
