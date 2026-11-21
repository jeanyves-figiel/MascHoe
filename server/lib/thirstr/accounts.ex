defmodule Thirstr.Accounts do
  @moduledoc """
  F-01 Auth & account: account lifecycle, devices and sessions.
  Spec: docs/spec/features/F01-auth.md.
  """
  import Ecto.Query
  alias Ecto.Multi
  alias Thirstr.{Ids, Repo, Valkey}
  alias Thirstr.Accounts.{Account, Device, Passkey, RefreshToken}

  @type session :: %{
          access_token: String.t(),
          refresh_token: String.t(),
          expires_in: pos_integer(),
          account: Account.t()
        }

  # ---------------------------------------------------------------- accounts

  def get_account(id), do: Repo.get(Account, id)

  @doc "Creates an account. R-01.12: the 18+ checkbox is mandatory on sign-up."
  def create_account(attrs, opts \\ []) do
    if opts[:age_confirmed] == true do
      %Account{age_confirmed_at: DateTime.utc_now()}
      |> Account.changeset(attrs)
      |> Repo.insert()
    else
      {:error, :age_confirmation_required}
    end
  end

  def find_or_create_by(field, hash, opts) when field in [:email_hash, :auth_oidc_hash] do
    case Repo.get_by(Account, [{field, hash}]) do
      %Account{status: s} when s in ~w(banned deleted) -> {:error, :forbidden}
      %Account{} = a -> {:ok, a, :existing}
      nil -> with {:ok, a} <- create_account(%{field => hash}, opts), do: {:ok, a, :created}
    end
  end

  @doc """
  RF-7: attach a confirmed sign-in email. If another account already uses it, nothing
  changes (no enumeration); the link still signs the owner back into their own account.
  """
  def attach_email(account_id, hash) do
    case Repo.get(Account, account_id) do
      %Account{status: s} when s in ~w(banned deleted) ->
        {:error, :forbidden}

      %Account{} = a ->
        if Repo.get_by(Account, email_hash: hash) do
          {:ok, a, :existing}
        else
          with {:ok, a} <- a |> Ecto.Changeset.change(email_hash: hash) |> Repo.update(),
               do: {:ok, a, :existing}
        end

      nil ->
        {:error, :unauthorized}
    end
  end

  @doc "R-01.9: profiles hidden everywhere, chats kept."
  def pause(%Account{} = a),
    do:
      a |> Account.changeset(%{status: "paused", paused_at: DateTime.utc_now()}) |> Repo.update()

  def resume(%Account{status: "paused"} = a),
    do: a |> Account.changeset(%{status: "active", paused_at: nil}) |> Repo.update()

  def resume(%Account{} = a), do: {:ok, a}

  @doc """
  R-01.10: hard delete. Rows cascade immediately; public photo objects are
  removed by a job (AC-01.4: all server data gone ≤ 24 h).
  """
  def delete_account(%Account{} = a) do
    keys =
      from(ph in Thirstr.Profiles.Photo,
        join: p in assoc(ph, :profile),
        where: p.account_id == ^a.id,
        select: ph.storage_key
      )
      |> Repo.all()

    Multi.new()
    |> Multi.delete(:account, a)
    |> Oban.insert(:purge, Thirstr.Jobs.PurgeObjects.new(%{"keys" => keys}))
    |> Repo.transaction()
    |> case do
      {:ok, _} -> :ok
      {:error, _, reason, _} -> {:error, reason}
    end
  end

  # ---------------------------------------------------------------- passkeys

  def add_passkey(%Account{} = a, credential_id, cose_key, sign_count) do
    %Passkey{
      account_id: a.id,
      credential_id: credential_id,
      cose_key: :erlang.term_to_binary(cose_key),
      sign_count: sign_count
    }
    |> Repo.insert(on_conflict: :nothing)
    |> case do
      {:ok, %Passkey{id: nil}} -> {:error, :conflict}
      other -> other
    end
  end

  def get_passkey(credential_id) do
    Passkey |> Repo.get_by(credential_id: credential_id) |> Repo.preload(:account)
  end

  # Input is server-written (own DB / RAM store), decoded with :safe.
  # sobelow_skip ["Misc.BinToTerm"]
  def passkey_cose_key(%Passkey{cose_key: bin}), do: :erlang.binary_to_term(bin, [:safe])

  def touch_passkey(%Passkey{} = pk, sign_count) do
    Repo.update_all(from(p in Passkey, where: p.id == ^pk.id), set: [sign_count: sign_count])
  end

  # ---------------------------------------------------------------- sessions

  @doc "Registers a device (R-01.8 max 5) and issues tokens."
  def start_session(%Account{} = a, platform) when is_binary(platform) do
    platform = if platform in Device.platforms(), do: platform, else: "web"
    max = auth_cfg(:max_devices)

    count = Repo.aggregate(from(d in Device, where: d.account_id == ^a.id), :count)

    if count >= max do
      {:error, :too_many_devices}
    else
      device =
        Repo.insert!(%Device{
          account_id: a.id,
          platform: platform,
          last_seen_day: Date.utc_today()
        })

      {:ok, issue_tokens(a, device)}
    end
  end

  @refresh_race_s 60

  @doc "R-01.5: rotate on use. Re-use of a spent token revokes the device (theft signal)."
  def refresh(token) when is_binary(token) do
    hash = Ids.hash("refresh", token)
    now = DateTime.utc_now()

    case Repo.get_by(RefreshToken, token_hash: hash) |> Repo.preload([:account, :device]) do
      nil ->
        {:error, :unauthorized}

      # #116: a token spent seconds ago is a client refresh race (parallel 401s), not theft.
      %RefreshToken{used_at: used} = rt when not is_nil(used) ->
        if DateTime.diff(now, used) < @refresh_race_s do
          {:error, :refresh_race}
        else
          Repo.delete(rt.device)
          {:error, :unauthorized}
        end

      %RefreshToken{expires_at: exp} = rt ->
        cond do
          DateTime.compare(exp, now) == :lt ->
            {:error, :unauthorized}

          rt.account.status in ~w(banned deleted) ->
            {:error, :forbidden}

          true ->
            case Repo.update_all(
                   from(r in RefreshToken, where: r.id == ^rt.id and is_nil(r.used_at)),
                   set: [used_at: now]
                 ) do
              {1, _} ->
                Repo.update_all(from(d in Device, where: d.id == ^rt.device_id),
                  set: [last_seen_day: Date.utc_today()]
                )

                {:ok, issue_tokens(rt.account, rt.device)}

              # a parallel request spent it between our read and write
              {0, _} ->
                {:error, :refresh_race}
            end
        end
    end
  end

  @doc "Log out everywhere (R-01.5): devices + refresh tokens deleted, access tokens fail device check."
  def logout_all(%Account{} = a) do
    Repo.delete_all(from(d in Device, where: d.account_id == ^a.id))
    :ok
  end

  def logout_device(device_id) do
    Repo.delete_all(from(d in Device, where: d.id == ^device_id))
    :ok
  end

  @doc "Validates an access token; returns {account, device_id}."
  def authenticate_access(token) do
    with {:ok, {account_id, device_id}} <-
           Phoenix.Token.verify(ThirstrWeb.Endpoint, "access", token,
             max_age: auth_cfg(:access_ttl_s)
           ),
         %Account{} = a <- Repo.get(Account, account_id),
         true <- Repo.exists?(from(d in Device, where: d.id == ^device_id)) do
      {:ok, a, device_id}
    else
      _ -> {:error, :unauthorized}
    end
  end

  defp issue_tokens(%Account{} = a, %Device{} = d) do
    refresh = Ids.random_token()
    ttl = auth_cfg(:refresh_ttl_s)

    Repo.insert!(%RefreshToken{
      account_id: a.id,
      device_id: d.id,
      token_hash: Ids.hash("refresh", refresh),
      expires_at: DateTime.add(DateTime.utc_now(), ttl, :second)
    })

    %{
      access_token: Phoenix.Token.sign(ThirstrWeb.Endpoint, "access", {a.id, d.id}),
      refresh_token: refresh,
      expires_in: auth_cfg(:access_ttl_s),
      account: a
    }
  end

  # ---------------------------------------------------------------- device flags

  @doc "R-02.3: device flagged 30 d after an under-18 birthday."
  def flag_underage_device(device_key) do
    Valkey.command!([
      "SET",
      "underage:" <> device_key,
      "1",
      "EX",
      Integer.to_string(auth_cfg(:underage_flag_ttl_s))
    ])

    :ok
  end

  def underage_flagged?(nil), do: false
  def underage_flagged?(device_key), do: Valkey.exists?("underage:" <> device_key)

  def auth_cfg(key), do: Application.fetch_env!(:thirstr, :auth)[key]
end
