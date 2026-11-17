import Config

# All environments read infra endpoints from env so DEV compose, CI and Fly share one shape.
env = fn name, default -> System.get_env(name) || default end
test? = config_env() == :test

if System.get_env("PHX_SERVER"), do: config(:thirstr, ThirstrWeb.Endpoint, server: true)

default_db =
  if test?,
    do:
      "ecto://postgres:postgres@localhost:5432/thirstr_test#{System.get_env("MIX_TEST_PARTITION")}",
    else: "ecto://postgres:postgres@localhost:5432/thirstr_dev"

config :thirstr, Thirstr.Repo,
  url: env.("DATABASE_URL", default_db),
  pool_size: String.to_integer(env.("POOL_SIZE", "10")),
  socket_options: if(env.("ECTO_IPV6", "false") in ~w(true 1), do: [:inet6], else: [])

app_url = env.("APP_URL", "https://localhost:7443")

config :thirstr,
  app_url: app_url,
  tiles_upstream: env.("TILES_UPSTREAM", "https://tiles.openfreemap.org"),
  classifier_url: System.get_env("CLASSIFIER_URL"),
  valkey_url: env.("VALKEY_URL", "redis://localhost:6379/#{if test?, do: 1, else: 0}"),
  # R-01.2/R-01.3: pepper for identifier hashes. Prod: injected from EU KMS via fly secrets.
  pepper: env.("ID_PEPPER", "dev-pepper-not-secret"),
  # AASA webcredentials (I-03): "<TeamID>.<bundle id>" once APPLE_TEAM_ID is set.
  apple_app_ids:
    (case System.get_env("APPLE_TEAM_ID") do
       nil ->
         []

       "" ->
         []

       team ->
         Enum.map(String.split(env.("IOS_BUNDLE_IDS", "app.thirstr"), ","), &"#{team}.#{&1}")
     end),
  webauthn: [
    origin: env.("WEBAUTHN_ORIGIN", app_url),
    rp_id: env.("WEBAUTHN_RP_ID", URI.parse(app_url).host),
    rp_name: "Thirstr"
  ],
  oidc: [
    # Dev/test accept tokens signed by the local dev issuer (see ThirstrWeb.DevController).
    dev_issuer: config_env() in [:dev, :test],
    google_client_ids: String.split(env.("GOOGLE_CLIENT_IDS", ""), ",", trim: true),
    apple_client_ids: String.split(env.("APPLE_CLIENT_IDS", "app.thirstr"), ",", trim: true)
  ],
  storage: [
    bucket: env.("S3_BUCKET", "thirstr-public"),
    # host used by the server itself
    internal_endpoint: env.("S3_ENDPOINT", "http://localhost:9000"),
    # host clients use for presigned PUT/GET
    public_endpoint: env.("S3_PUBLIC_ENDPOINT", "https://localhost:7444"),
    region: env.("S3_REGION", "eu-central-1")
  ]

if System.get_env("CLASSIFIER_URL") not in [nil, ""] do
  config :thirstr, :photo_classifier, Thirstr.Moderation.NudeNetClassifier
end

s3 = URI.parse(env.("S3_ENDPOINT", "http://localhost:9000"))

config :ex_aws,
  access_key_id: env.("S3_ACCESS_KEY", "thirstr"),
  secret_access_key: env.("S3_SECRET_KEY", "thirstr-dev-secret"),
  region: env.("S3_REGION", "eu-central-1"),
  json_codec: Jason,
  http_client: ExAws.Request.Req

config :ex_aws, :s3,
  scheme: "#{s3.scheme}://",
  host: s3.host,
  port: s3.port,
  region: env.("S3_REGION", "eu-central-1")

if config_env() == :dev do
  config :thirstr, Thirstr.Mailer,
    adapter: Swoosh.Adapters.SMTP,
    relay: env.("SMTP_HOST", "localhost"),
    port: String.to_integer(env.("SMTP_PORT", "1025")),
    ssl: false,
    tls: :never,
    auth: :never
end

if config_env() == :prod do
  secret_key_base =
    System.get_env("SECRET_KEY_BASE") || raise "environment variable SECRET_KEY_BASE is missing"

  System.get_env("ID_PEPPER") || raise "environment variable ID_PEPPER is missing"
  host = env.("PHX_HOST", "localhost")

  config :thirstr, :dns_cluster_query, System.get_env("DNS_CLUSTER_QUERY")

  config :thirstr, ThirstrWeb.Endpoint,
    url: [host: host, port: 443, scheme: "https"],
    http: [ip: {0, 0, 0, 0, 0, 0, 0, 0}, port: String.to_integer(env.("PORT", "4000"))],
    secret_key_base: secret_key_base

  if smtp = System.get_env("SMTP_HOST") do
    config :thirstr, Thirstr.Mailer,
      adapter: Swoosh.Adapters.SMTP,
      relay: smtp,
      port: String.to_integer(env.("SMTP_PORT", "587")),
      username: System.get_env("SMTP_USER"),
      password: System.get_env("SMTP_PASSWORD"),
      tls: :always,
      auth: :always
  end
end
