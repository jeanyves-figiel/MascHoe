defmodule ThirstrWeb.Router do
  use ThirstrWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :maybe_auth do
    plug ThirstrWeb.Plugs.Auth, optional: true
  end

  pipeline :auth do
    plug ThirstrWeb.Plugs.Auth
  end

  pipeline :auth_limit do
    plug ThirstrWeb.Plugs.RateLimit, bucket: "auth", limit: 60, window: 3600
  end

  pipeline :email_limit do
    plug ThirstrWeb.Plugs.RateLimit, bucket: "email", limit: 5, window: 3600
  end

  scope "/v1", ThirstrWeb do
    pipe_through :api

    get "/health", PublicController, :health
    get "/welcome", PublicController, :welcome
    get "/cities", PublicController, :cities

    scope "/auth" do
      pipe_through [:auth_limit, :maybe_auth]
      post "/passkey/register/options", AuthController, :passkey_register_options
      post "/passkey/register", AuthController, :passkey_register
      post "/passkey/login/options", AuthController, :passkey_login_options
      post "/passkey/login", AuthController, :passkey_login
      post "/oidc", AuthController, :oidc
      post "/email/verify", AuthController, :email_verify
      post "/refresh", AuthController, :refresh
    end

    scope "/auth" do
      pipe_through [:email_limit]
      post "/email/link", AuthController, :email_link
    end

    scope "/" do
      pipe_through :auth
      post "/auth/logout", AuthController, :logout
      post "/auth/logout_all", AuthController, :logout_all

      get "/me", AccountController, :me
      delete "/account", AccountController, :delete
      post "/account/pause", AccountController, :pause
      post "/account/resume", AccountController, :resume

      put "/me/basics", AccountController, :basics
      put "/me/location", AccountController, :location
      post "/me/profiles/:profile_id/photos", AccountController, :create_photo
      post "/me/profiles/:profile_id/photos/:photo_id/check", AccountController, :check_photo
      post "/me/onboarding/verify_later", AccountController, :verify_later
    end
  end

  if Application.compile_env(:thirstr, :dev_routes) do
    scope "/v1/dev", ThirstrWeb do
      pipe_through :api
      post "/oidc/token", DevController, :oidc_token
    end
  end
end
