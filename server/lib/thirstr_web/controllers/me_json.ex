defmodule ThirstrWeb.MeJSON do
  @moduledoc "Own-account view. Never includes account id, email or birthdate."
  alias Thirstr.Accounts.Account
  alias Thirstr.{Onboarding, Repo, Storage}

  def me(%Account{} = a) do
    profile = Onboarding.main_profile(a)

    %{
      status: a.status,
      verified: Account.verified?(a),
      onboarding_step: a.onboarding_step,
      safe_mode: a.safe_mode,
      profile: profile && profile(profile),
      location: profile && location(profile.id)
    }
  end

  def session(%{access_token: at, refresh_token: rt, expires_in: exp, account: a}),
    do: %{access_token: at, refresh_token: rt, expires_in: exp, account: me(a)}

  def photo(ph) do
    %{
      id: ph.id,
      slot: ph.slot,
      status: ph.status,
      reject_reason: ph.reject_reason,
      url: if(ph.status in ~w(ok_main ok_public), do: Storage.presigned_get(ph.storage_key))
    }
  end

  defp profile(p) do
    %{
      id: p.id,
      display_name: p.display_name,
      age: p.age,
      gender: p.gender,
      gender_other: p.gender_other,
      here_for: p.here_for,
      photos: Enum.map(p.photos, &photo/1)
    }
  end

  defp location(profile_id) do
    case Repo.query!("SELECT level FROM location_cells WHERE profile_id = $1", [
           Ecto.UUID.dump!(profile_id)
         ]).rows do
      [[level]] -> %{level: level}
      _ -> %{level: nil}
    end
  end
end
