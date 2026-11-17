defmodule Thirstr.Jobs.PushWake do
  @moduledoc "Delivers one content-free wake-up per account (F-16)."
  use Oban.Worker, queue: :push, max_attempts: 3

  @impl true
  def perform(%Oban.Job{args: %{"account_id" => id, "event" => event}}) do
    Thirstr.Push.deliver(id, event)
  end
end
