defmodule ThirstrWeb.Plugs.WebClient do
  @moduledoc """
  Serves the Expo web build (priv/static/web) for staging testers when
  SERVE_WEB_CLIENT=true. Prod keeps it off: the public web client is Later (spec README).
  """
  @behaviour Plug
  import Plug.Conn

  @static Plug.Static.init(at: "/", from: {:thirstr, "priv/static/web"}, gzip: false)

  def init(opts), do: opts

  def call(%Plug.Conn{method: "GET", path_info: [first | _]} = conn, _)
      when first in ["v1", "socket"],
      do: conn

  def call(%Plug.Conn{method: "GET"} = conn, _) do
    if enabled?() do
      conn = Plug.Static.call(conn, @static)
      if conn.halted, do: conn, else: index(conn)
    else
      conn
    end
  end

  def call(conn, _), do: conn

  # Path is a constant inside the release, never derived from the request.
  # sobelow_skip ["Traversal.SendFile"]
  defp index(conn) do
    path = Application.app_dir(:thirstr, "priv/static/web/index.html")

    if File.exists?(path) do
      conn |> put_resp_content_type("text/html") |> send_file(200, path) |> halt()
    else
      conn
    end
  end

  defp enabled?, do: System.get_env("SERVE_WEB_CLIENT") in ~w(true 1)
end
