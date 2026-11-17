defmodule Thirstr.Profiles.Profile do
  @moduledoc "profiles table (F-06). One per kind (now, sport, friends), max 3 per account (R-06.1)."
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @timestamps_opts [type: :utc_datetime_usec]

  # R-02.4 / R-02.5
  @genders ~w(man trans_man non_binary other)
  @here_for ~w(hookup tonight chat friends sport)

  schema "profiles" do
    belongs_to :account, Thirstr.Accounts.Account
    field :kind, :string, default: "now"
    field :display_name, :string
    field :age, :integer
    field :gender, :string
    field :gender_other, :string
    field :here_for, {:array, :string}, default: ["hookup", "tonight"]
    field :visibility_map, :map, default: %{}
    field :photo_ids, {:array, :binary_id}, default: []
    field :completeness, :integer, default: 0
    field :seeded, :boolean, default: false
    field :fields, :map, default: %{}
    field :public_updated_at, :utc_datetime_usec
    has_many :photos, Thirstr.Profiles.Photo
    timestamps()
  end

  @kinds ~w(now sport friends)
  def kinds, do: @kinds
  def genders, do: @genders
  def here_for_values, do: @here_for

  def basics_changeset(profile, attrs) do
    profile
    |> cast(attrs, [:display_name, :gender, :gender_other, :here_for])
    |> update_change(:display_name, &String.trim/1)
    |> validate_required([:display_name, :gender])
    |> validate_length(:display_name, min: 1, max: 30)
    |> validate_inclusion(:gender, @genders)
    |> validate_gender_other()
    |> validate_subset(:here_for, @here_for)
    |> validate_length(:here_for, min: 1)
  end

  defp validate_gender_other(cs) do
    if get_field(cs, :gender) == "other" do
      cs |> validate_required([:gender_other]) |> validate_length(:gender_other, max: 20)
    else
      put_change(cs, :gender_other, nil)
    end
  end
end
