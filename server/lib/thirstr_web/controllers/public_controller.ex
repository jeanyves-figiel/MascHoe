defmodule ThirstrWeb.PublicController do
  @moduledoc "Unauthenticated read endpoints: health, Welcome counts (R-02.2), city picker (S-04b)."
  use ThirstrWeb, :controller
  alias Thirstr.Location
  alias Thirstr.Geo.IpGeo

  def health(conn, _) do
    Ecto.Adapters.SQL.query!(Thirstr.Repo, "SELECT 1")

    json(conn, %{
      ok: true,
      version: Application.spec(:thirstr, :vsn) |> to_string(),
      release: System.get_env("RELEASE_SHA", "dev")
    })
  end

  def welcome(conn, _) do
    city =
      case IpGeo.impl().city_for_ip(conn.remote_ip) do
        {:ok, c} -> c
        :unknown -> nil
      end

    json(
      conn,
      if(city, do: Location.welcome(city), else: %{city: nil, center: nil, count: nil, cells: []})
    )
  end

  def cities(conn, params), do: json(conn, %{cities: Location.search_cities(params["q"])})
end
