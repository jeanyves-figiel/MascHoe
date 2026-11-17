defmodule Thirstr.Trust do
  @moduledoc "F-18 badges and vouches, I-01 linked accounts (read side; write side in B4)."
  alias Thirstr.Repo

  def vouch_count(_profile_id), do: 0

  @doc "System badges (F-18). Vouches never feed Explore ordering (R-18.6)."
  def badges(t) do
    years = div(DateTime.diff(DateTime.utc_now(), t.inserted_at, :day), 365)

    [
      t.verified_at && %{kind: "verified", since: Calendar.strftime(t.verified_at, "%Y-%m")},
      %{kind: "member_since", years: years}
    ]
    |> Enum.reject(&is_nil/1)
  end

  def linked_accounts(_profile_id, _audience), do: []

  @doc false
  def repo, do: Repo
end
