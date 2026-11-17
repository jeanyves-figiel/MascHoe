defmodule ThirstrWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :thirstr

  # Code reloading can be explicitly enabled under the
  # :code_reloader configuration of your endpoint.
  if code_reloading? do
    plug Phoenix.CodeReloader
    plug Phoenix.Ecto.CheckRepoStatus, otp_app: :thirstr
  end

  plug Plug.RequestId
  plug Plug.RewriteOn, [:x_forwarded_for, :x_forwarded_proto]
  plug Plug.Telemetry, event_prefix: [:phoenix, :endpoint]

  plug Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library()

  plug Plug.Head
  plug ThirstrWeb.Plugs.Site
  plug ThirstrWeb.Router
end
