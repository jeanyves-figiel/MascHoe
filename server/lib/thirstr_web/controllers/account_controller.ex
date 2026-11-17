defmodule ThirstrWeb.AccountController do
  @moduledoc "Own account (F-01 R-01.9/R-01.10) and onboarding steps (F-02)."
  use ThirstrWeb, :controller

  alias Thirstr.{Accounts, Onboarding}
  alias ThirstrWeb.{MeJSON, Plugs}

  action_fallback ThirstrWeb.FallbackController

  def me(conn, _), do: json(conn, MeJSON.me(conn.assigns.account))

  def pause(conn, _) do
    with {:ok, a} <- Accounts.pause(conn.assigns.account), do: json(conn, MeJSON.me(a))
  end

  def resume(conn, _) do
    with {:ok, a} <- Accounts.resume(conn.assigns.account), do: json(conn, MeJSON.me(a))
  end

  @doc "R-01.10: client confirms with biometrics, then sends confirm=DELETE."
  def delete(conn, %{"confirm" => "DELETE"}) do
    with :ok <- Accounts.delete_account(conn.assigns.account), do: send_resp(conn, 202, "")
  end

  def delete(_conn, _), do: {:error, {:validation, %{confirm: ["type DELETE to confirm"]}}}

  # --- onboarding

  def basics(conn, params) do
    with {:ok, {a, _profile}} <-
           Onboarding.save_basics(conn.assigns.account, params, Plugs.Auth.install_key(conn)) do
      json(conn, MeJSON.me(a))
    end
  end

  def location(conn, params) do
    with {:ok, a} <- Onboarding.set_location(conn.assigns.account, params),
         do: json(conn, MeJSON.me(a))
  end

  def create_photo(conn, %{"profile_id" => pid} = params) do
    with :ok <- own_profile(conn, pid),
         {:ok, photo, put_url} <-
           Onboarding.create_photo_upload(
             conn.assigns.account,
             params["slot"] || 0,
             params["content_type"] || "image/jpeg"
           ) do
      conn
      |> put_status(201)
      |> json(%{
        photo_id: photo.id,
        put_url: put_url,
        content_type: params["content_type"] || "image/jpeg"
      })
    end
  end

  def check_photo(conn, %{"profile_id" => pid, "photo_id" => id}) do
    with :ok <- own_profile(conn, pid),
         {:ok, photo, a} <- Onboarding.check_photo(conn.assigns.account, id) do
      json(conn, %{photo: MeJSON.photo(photo), account: MeJSON.me(a)})
    end
  end

  def verify_later(conn, _) do
    with {:ok, a} <- Onboarding.verify_later(conn.assigns.account), do: json(conn, MeJSON.me(a))
  end

  defp own_profile(conn, pid) do
    case Onboarding.main_profile(conn.assigns.account) do
      %{id: ^pid} -> :ok
      _ -> {:error, :not_found}
    end
  end
end
