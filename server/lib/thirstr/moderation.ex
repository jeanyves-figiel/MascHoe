defmodule Thirstr.Moderation do
  @moduledoc """
  F-15 moderation actions. Shadow quarantine (R-15.6): the account keeps a normal UI, but
  everything it sends or shows reaches nobody until reviewed (AC-15.1).
  """
  alias Thirstr.Repo
  alias Thirstr.Accounts.Account

  def auto_quarantine(%Account{status: "active"} = a, reason) do
    a |> Ecto.Changeset.change(status: "quarantined") |> Repo.update!()
    log_action(a.id, "quarantine", reason, "system")
    :ok
  end

  def auto_quarantine(_, _), do: :ok

  def log_action(account_id, action, reason, actor) do
    Repo.insert_all("moderation_actions", [
      %{
        id: Ecto.UUID.bingenerate(),
        target_account: Ecto.UUID.dump!(account_id),
        action: action,
        reason: reason,
        actor: actor,
        created_at: DateTime.utc_now()
      }
    ])

    :ok
  end
end
