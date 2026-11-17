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

    :ok
  end
end
