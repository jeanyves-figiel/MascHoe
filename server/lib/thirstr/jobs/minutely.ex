defmodule Thirstr.Jobs.Minutely do
  @moduledoc """
  Every minute: R-05.2 k-anonymity display resolution; expiry of Now status (AC-09.1: gone
  from the API ≤ 1 min after expiry, queries also filter on expires_at).
  """
  use Oban.Worker, queue: :maintenance, unique: [period: 50]

  @impl true
  def perform(_job) do
    Thirstr.Location.refresh_k_anonymity()
    Thirstr.Repo.query!("DELETE FROM now_status WHERE expires_at < now()")
    :ok
  end
end
