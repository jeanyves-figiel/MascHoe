defmodule Thirstr.TestBot do
  @moduledoc """
  Chat test bot (testing.md › Chat test bot, issue #109): one automated, clearly labelled
  account on staging so testers can try chat end to end (E2EE, Delivered/Read ticks,
  typing, on-device translation). The bot itself is a separate MLS client
  (`apps/testbot`) that holds its own keys; the server only gives it an account,
  a profile near Zurich Altstetten and a session, like any other client.

  Off unless `TESTBOT_KEY` is set, and never on in production.
  """
  import Ecto.Query
  alias Thirstr.{Accounts, Repo}
  alias Thirstr.Accounts.{Account, Device}
  alias Thirstr.Profiles.Profile

  # Zurich Altstetten (public place, not a person).
  @lat 47.3914
  @lng 8.4887
  @name "Testbot 🤖"
  @bio "TEST ACCOUNT · automated chat bot for testing, not a real person. Write \"help\" for commands."

  def enabled? do
    key = Application.get_env(:thirstr, :testbot_key)
    prod? = System.get_env("DEPLOY_ENV") in ~w(prod production)
    is_binary(key) and byte_size(key) >= 24 and not prod?
  end

  @doc "Constant-time check of the bot service key."
  def key_ok?(given) when is_binary(given) do
    enabled?() and Plug.Crypto.secure_compare(given, Application.get_env(:thirstr, :testbot_key))
  end

  def key_ok?(_), do: false

  @doc """
  Creates or refreshes the bot account (verified, onboarded, visible in every lens, area
  location at Altstetten). Idempotent. Returns `{account, profile}`.
  """
  def ensure! do
    {a, p} =
      case Repo.one(from(a in Account, where: a.test_bot, limit: 1)) do
        nil -> create!()
        a -> {a, Repo.one!(from(p in Profile, where: p.account_id == ^a.id, limit: 1))}
      end

    now = DateTime.utc_now()

    Repo.update_all(from(x in Account, where: x.id == ^a.id),
      set: [status: "active", verified_at: a.verified_at || now, hidden: false, incognito: false]
    )

    Repo.query!(
      """
      INSERT INTO location_cells (profile_id, level, cell_r9, cell_r8, cell_r7, cell_r5, updated_at)
      SELECT $1, 'area',
             h3_lat_lng_to_cell(point($3::float8, $2::float8), 9)::bigint,
             h3_lat_lng_to_cell(point($3::float8, $2::float8), 8)::bigint,
             h3_lat_lng_to_cell(point($3::float8, $2::float8), 7)::bigint,
             h3_lat_lng_to_cell(point($3::float8, $2::float8), 5)::bigint, now()
      ON CONFLICT (profile_id) DO UPDATE SET level = 'area', cell_r9 = EXCLUDED.cell_r9,
        cell_r8 = EXCLUDED.cell_r8, cell_r7 = EXCLUDED.cell_r7, cell_r5 = EXCLUDED.cell_r5,
        updated_at = now()
      """,
      [Ecto.UUID.dump!(p.id), @lat, @lng]
    )

    {Repo.get!(Account, a.id), p}
  end

  defp create! do
    now = DateTime.utc_now()

    Repo.transaction(fn ->
      a =
        Repo.insert!(%Account{
          status: "active",
          safe_mode: "off",
          onboarding_step: "done",
          birthdate: Date.add(Date.utc_today(), -30 * 365),
          age_confirmed_at: now,
          verified_at: now,
          test_bot: true,
          settings: %{"hide_from_unverified" => false, "read_receipts" => true}
        })

      p =
        Repo.insert!(%Profile{
          account_id: a.id,
          kind: "now",
          display_name: @name,
          age: 30,
          gender: "man",
          here_for: Profile.here_for_values(),
          show_in: Profile.lenses(),
          # no photo: shown like seeded data (Explore lists seeded profiles without photos)
          seeded: true,
          completeness: 60,
          fields: %{"bio" => @bio, "languages" => ~w(de pt fr es it en)},
          public_updated_at: now
        })

      {a, p}
    end)
    |> elem(1)
  end

  @doc """
  New session for the bot service. Earlier bot devices are removed first (their key
  packages and queued ciphertext go with them), so peers never claim keys nobody holds.
  """
  def session! do
    {a, p} = ensure!()
    Repo.delete_all(from(d in Device, where: d.account_id == ^a.id))
    {:ok, tokens} = Accounts.start_session(a, "web")
    Map.put(tokens, :profile_id, p.id)
  end
end
