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

  # iOS passkeys / universal links (I-03). Apple fetches this without auth.
  scope "/.well-known", ThirstrWeb do
    get "/apple-app-site-association", WellKnownController, :aasa
  end

  scope "/v1", ThirstrWeb do
    pipe_through :api

    get "/health", PublicController, :health
    get "/welcome", PublicController, :welcome
    get "/cities", PublicController, :cities

    # Map tiles proxied so the upstream never sees users (beta-build-plan.md)
    get "/tiles/style.json", TileController, :style
    get "/tiles/v/:z/:x/:y", TileController, :tile
    get "/tiles/fonts/:stack/:range", TileController, :font

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
      post "/me/onboarding/verify_later", AccountController, :verify_later

      # F-06 profiles
      get "/profile-options", ProfileController, :options
      get "/me/profiles", ProfileController, :index
      post "/me/profiles", ProfileController, :create
      patch "/me/profiles/:id", ProfileController, :update
      delete "/me/profiles/:id", ProfileController, :delete
      post "/me/profiles/:profile_id/photos", ProfileController, :create_photo
      post "/me/profiles/:profile_id/photos/:photo_id/check", ProfileController, :check_photo
      delete "/me/profiles/:profile_id/photos/:photo_id", ProfileController, :delete_photo
      put "/me/profiles/:profile_id/photos/order", ProfileController, :order_photos
      get "/profiles/:id", ProfileController, :show
      post "/profiles/:id/tap", ProfileController, :tap
      post "/profiles/:id/block", ProfileController, :block
      post "/profiles/:id/hide", ProfileController, :hide
      delete "/profiles/:id/hide", ProfileController, :unhide
      get "/me/blocks", ProfileController, :blocks
      delete "/me/blocks/:id", ProfileController, :unblock
      get "/taps", ProfileController, :taps
      post "/taps/seen", ProfileController, :taps_seen

      # F-05 location & visibility
      put "/me/location", ExploreController, :location
      put "/me/pin", ExploreController, :pin
      delete "/me/pin", ExploreController, :unpin
      patch "/me/visibility", ExploreController, :visibility

      # F-04 explore
      get "/explore/grid", ExploreController, :grid
      get "/explore/map", ExploreController, :map
      get "/explore/tray", ExploreController, :tray

      # F-09 Now
      put "/me/now", ExploreController, :set_now
      delete "/me/now", ExploreController, :end_now

      # F-17 / F-14
      get "/me/settings", ExploreController, :settings
      patch "/me/settings", ExploreController, :update_settings
      put "/me/safe_mode", ExploreController, :safe_mode

      # Messaging (F-07, F-08, F-16): MLS delivery service, E2EE blobs, push token
      post "/mls/keypackages", ChatController, :upload_key_packages
      get "/mls/keypackages", ChatController, :key_package_counts
      post "/mls/keypackages/claim", ChatController, :claim_key_packages
      post "/mls/messages", ChatController, :send_messages
      get "/mls/messages", ChatController, :pull
      post "/mls/messages/ack", ChatController, :ack
      post "/media/upload", ChatController, :create_blob
      get "/media/:id", ChatController, :blob
      delete "/media/:id", ChatController, :delete_blob
      put "/me/push", ChatController, :push_token
    end
  end

  if Application.compile_env(:thirstr, :dev_routes) do
    scope "/v1/dev", ThirstrWeb do
      pipe_through :api
      post "/oidc/token", DevController, :oidc_token
    end
  end
end
