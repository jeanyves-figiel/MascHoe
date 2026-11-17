defmodule ThirstrWeb.MeJSON do
  @moduledoc "Own-account view. Never includes account id, email or birthdate."
  alias Thirstr.Accounts.Account
  alias Thirstr.{Location, Profiles, Repo, Settings, Social, Storage}

  def me(%Account{} = a) do
    profiles = Profiles.list_own(a)
    main = Enum.find(profiles, &(&1.kind == "now"))

    %{
      # Shadow quarantine is never revealed to the account (R-15.6).
      status: if(a.status == "quarantined", do: "active", else: a.status),
      verified: Account.verified?(a),
      verified_since: a.verified_at && Calendar.strftime(a.verified_at, "%Y-%m"),
      onboarding_step: a.onboarding_step,
      safe_mode: a.safe_mode,
      safe_mode_active: a.safe_mode_active,
      incognito: a.incognito,
      hidden: a.hidden,
      member_since: a.inserted_at && Calendar.strftime(a.inserted_at, "%Y-%m"),
      profile: main && profile(main),
      profiles: Enum.map(profiles, &profile/1),
      location: main && location(a, main.id),
      now: main && Social.now_of(main.id),
      settings: Settings.get(a)
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
      main_ok: Map.get(ph.classifier_score || %{}, "main_ok", ph.status == "ok_main"),
      url:
        if(ph.status in ~w(ok_main ok_public pending), do: Storage.presigned_get(ph.storage_key))
    }
  end

  def profile(p) do
    %{
      id: p.id,
      kind: p.kind,
      display_name: p.display_name,
      age: p.age,
      gender: p.gender,
      gender_other: p.gender_other,
      here_for: p.here_for,
      fields: p.fields || %{},
      visibility_map: p.visibility_map || %{},
      completeness: p.completeness,
      photos: p.photos |> Enum.reject(&(&1.status == "rejected")) |> Enum.map(&photo/1)
    }
  end

  defp location(a, profile_id) do
    level =
      case Repo.query!(
             "SELECT level, hide_from_hidden FROM location_cells WHERE profile_id = $1",
             [
               Ecto.UUID.dump!(profile_id)
             ]
           ).rows do
        [[level, _]] -> level
        _ -> if a.hidden, do: "hidden"
      end

    %{
      level: level,
      pin: Location.own_pin_info(a),
      hide_from_hidden: Location.hide_from_hidden?(a)
    }
  end
end
