defmodule Thirstr.Jobs.ExpirySweep do
  @moduledoc "Retention sweeps (data-model.md › Retention). Seeded DEV profiles are exempt."
  use Oban.Worker, queue: :maintenance

  import Ecto.Query

  @impl true
  def perform(_job) do
    Thirstr.Repo.delete_all(
      from lc in "location_cells",
        join: p in "profiles",
        on: p.id == lc.profile_id,
        where: lc.updated_at < ago(24, "hour") and p.seeded == false
    )

    # taps expire after 7 days (data-model.md)
    Thirstr.Repo.query!("DELETE FROM taps WHERE created_at < now() - interval '7 days'")
    # ciphertext queue 30 d, franking tags 90 d, expired media blobs (R-07.12, R-08.10)
    Thirstr.Chat.sweep()
    Thirstr.Verification.sweep()
    :ok
  end
end
