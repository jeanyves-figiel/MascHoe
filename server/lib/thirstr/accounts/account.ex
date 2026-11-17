defmodule Thirstr.Accounts.Account do
  @moduledoc "accounts table (data-model.md). Never exposed by id in the API."
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @timestamps_opts [type: :utc_datetime_usec]

  @statuses ~w(active paused quarantined banned deleted)
  @steps ~w(basics location photo verify done)

  schema "accounts" do
    field :status, :string, default: "active"
    field :safe_mode, :string, default: "auto"
    field :auth_oidc_hash, :binary
    field :email_hash, :binary
    field :age_confirmed_at, :utc_datetime_usec
    field :birthdate, :date
    field :onboarding_step, :string, default: "basics"
    field :verified_at, :utc_datetime_usec
    field :verification_epoch, :integer, default: 0
    field :paused_at, :utc_datetime_usec
    field :settings, :map, default: %{}
    has_many :passkeys, Thirstr.Accounts.Passkey
    has_many :devices, Thirstr.Accounts.Device
    has_many :profiles, Thirstr.Profiles.Profile
    timestamps()
  end

  def steps, do: @steps

  def changeset(account, attrs) do
    account
    |> cast(attrs, [
      :status,
      :onboarding_step,
      :birthdate,
      :paused_at,
      :email_hash,
      :auth_oidc_hash
    ])
    |> validate_inclusion(:status, @statuses)
    |> validate_inclusion(:onboarding_step, @steps)
    |> unique_constraint(:auth_oidc_hash)
    |> unique_constraint(:email_hash)
  end

  def verified?(%__MODULE__{verified_at: v}), do: not is_nil(v)
end
