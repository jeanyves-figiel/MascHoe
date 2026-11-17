defmodule ThirstrWeb.TestHelpers do
  @moduledoc false
  import Plug.Conn
  import Phoenix.ConnTest
  @endpoint ThirstrWeb.Endpoint

  @doc "Signs up through the dev OIDC issuer; returns {authed_conn, session_json}."
  def sign_up(conn, sub \\ nil) do
    token = Thirstr.Auth.OIDC.dev_mint(sub || "sub-" <> Thirstr.Ids.random_token(6))

    body =
      conn
      |> post("/v1/auth/oidc", %{provider: "apple", id_token: token, age_confirmed: true})
      |> json_response(201)

    {authed(conn, body["access_token"]), body}
  end

  def authed(conn, access),
    do:
      conn
      |> recycle()
      |> put_req_header("authorization", "Bearer " <> access)
      |> put_req_header("x-thirstr-install", "test-install-0123456789")

  @doc "Keeps the bearer + install headers across requests."
  def recycle_authed(conn) do
    [auth] = get_req_header(conn, "authorization")

    conn
    |> recycle()
    |> put_req_header("authorization", auth)
    |> put_req_header("x-thirstr-install", "test-install-0123456789")
  end

  def adult_birthdate, do: Date.utc_today() |> Date.add(-25 * 366) |> Date.to_iso8601()

  def basics(conn, attrs \\ %{}) do
    put(
      conn,
      "/v1/me/basics",
      Map.merge(
        %{
          display_name: "Max",
          birthdate: adult_birthdate(),
          gender: "man",
          here_for: ["hookup", "tonight"]
        },
        attrs
      )
    )
  end

  @doc "Zurich centre at r9, computed by Postgres h3."
  def zurich_r9 do
    %{rows: [[c]]} =
      Thirstr.Repo.query!("SELECT h3_lat_lng_to_cell(point(8.5417, 47.3769), 9)::text")

    c
  end
end
