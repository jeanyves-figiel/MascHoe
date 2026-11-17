defmodule Thirstr.Notify do
  @moduledoc """
  Realtime + push fan-out (api.md › Realtime, F-16). Events go to the account's private
  topic; if no socket is connected the device gets a content-free push (R-16.1).
  """
  def topic(account_id), do: "user:" <> account_id

  def event(account_id, event, payload) do
    Phoenix.PubSub.broadcast(Thirstr.PubSub, topic(account_id), {:event, event, payload})
    Thirstr.Push.maybe_wake(account_id, event)
    :ok
  end
end

defmodule Thirstr.Push do
  @moduledoc "Content-free wake-up pushes (F-16). Real APNs delivery lands with chat (B2)."
  def maybe_wake(_account_id, _event), do: :ok
end
