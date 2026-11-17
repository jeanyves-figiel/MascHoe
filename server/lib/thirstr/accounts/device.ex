defmodule Thirstr.Accounts.Device do
  @moduledoc "Device registration (R-01.8: max 5 per account)."
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @timestamps_opts [type: :utc_datetime_usec]

  schema "devices" do
    belongs_to :account, Thirstr.Accounts.Account
    field :platform, :string
    field :attestation_ok, :boolean, default: false
    field :last_seen_day, :date
    timestamps()
  end

  def platforms, do: ~w(ios android web)
end
