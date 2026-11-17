defmodule ThirstrWeb.WellKnownController do
  @moduledoc """
  apple-app-site-association: binds the iOS app to this host as a WebAuthn relying
  party (`webcredentials`). App IDs are `<TeamID>.<bundle id>`, from APPLE_TEAM_ID.
  404 until a team is configured.
  """
  use ThirstrWeb, :controller

  def aasa(conn, _) do
    case Application.get_env(:thirstr, :apple_app_ids, []) do
      [] ->
        send_resp(conn, 404, "")

      ids ->
        json(conn, %{webcredentials: %{apps: ids}})
    end
  end
end
