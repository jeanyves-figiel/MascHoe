defmodule ThirstrWeb.Plugs.Auth do
  @moduledoc "Bearer access token (R-01.5). Assigns :account and :device_id."
  import Plug.Conn
  alias Thirstr.Accounts

  def init(opts), do: opts

  def call(conn, opts) do
    with ["Bearer " <> token] <- get_req_header(conn, "authorization"),
         {:ok, account, device_id} <- Accounts.authenticate_access(token),
         false <- account.status in ~w(banned deleted) do
      touch_seen(account.id)
      conn |> assign(:account, account) |> assign(:device_id, device_id)
    else
      _ ->
        if opts[:optional] do
          conn
        else
          conn
          |> put_status(401)
          |> Phoenix.Controller.json(%{error: %{code: "unauthorized", message: "Sign in again"}})
          |> halt()
        end
    end
  end

  # Online dot (F-04): last activity, RAM only, 15 min.
  defp touch_seen(account_id) do
    Thirstr.Valkey.command([
      "SET",
      "seen:" <> account_id,
      Integer.to_string(System.system_time(:second)),
      "EX",
      "900"
    ])
  end

  @doc "Hashed install id (sent by the app) used for the R-02.3 under-age flag."
  def install_key(conn) do
    case get_req_header(conn, "x-thirstr-install") do
      [id] when byte_size(id) in 16..128 -> Thirstr.Ids.hash("install", id) |> Base.encode16()
      _ -> nil
    end
  end
end
