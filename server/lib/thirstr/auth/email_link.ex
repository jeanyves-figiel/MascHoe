defmodule Thirstr.Auth.EmailLink do
  @moduledoc """
  Email magic link (F-01 R-01.3): 15 min, single use, always 202.
  The email address is used once to send the link and then forgotten; only its
  peppered hash is stored. Work happens off the request path so known and unknown
  addresses respond with identical timing (AC-01.3).
  """
  import Swoosh.Email
  alias Thirstr.{Accounts, Ids, Mailer, Valkey}

  def request(email, opts) when is_binary(email) do
    email = Ids.normalize_email(email)
    if valid_email?(email), do: dispatch(fn -> deliver(email, opts) end)
    :ok
  end

  def request(_, _), do: :ok

  defp dispatch(fun) do
    if Application.get_env(:thirstr, :email_link_async, true),
      do: Task.Supervisor.start_child(Thirstr.TaskSup, fun),
      else: fun.()
  end

  defp deliver(email, opts) do
    token = Ids.random_token()
    ttl = Accounts.auth_cfg(:magic_link_ttl_s)

    Valkey.put_term(
      "ml:" <> Base.encode16(Ids.hash("magic", token)),
      %{email_hash: Ids.hash("email", email), age_confirmed: opts[:age_confirmed] == true},
      ttl
    )

    link = Application.fetch_env!(:thirstr, :app_url) <> "/auth/email?token=" <> token

    new()
    |> to(email)
    |> from({"Thirstr", "hello@thirstr.app"})
    |> subject("Your Thirstr sign-in link")
    |> text_body("""
    Tap to sign in to Thirstr:

    #{link}

    The link works once and expires in 15 minutes. If you did not ask for it, ignore this email.
    """)
    |> Mailer.deliver()
  end

  @doc "Consumes the token. Returns {:ok, account, :created | :existing}."
  def verify(token) when is_binary(token) do
    case Valkey.take_term("ml:" <> Base.encode16(Ids.hash("magic", token))) do
      nil ->
        {:error, :unauthorized}

      %{email_hash: h, age_confirmed: age} ->
        Accounts.find_or_create_by(:email_hash, h, age_confirmed: age)
    end
  end

  def verify(_), do: {:error, :validation}

  defp valid_email?(e),
    do: byte_size(e) <= 254 and Regex.match?(~r/^[^\s@]+@[^\s@]+\.[^\s@]+$/, e)
end
