defmodule Thirstr.Release do
  @moduledoc "Release tasks: `bin/thirstr eval 'Thirstr.Release.migrate()'` (Fly release_command)."
  @app :thirstr

  def migrate do
    load_app()

    for repo <- repos(),
        do: {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :up, all: true))
  end

  @doc "Synthetic data for staging only; refuses to run when DEPLOY_ENV=production."
  def seed do
    if System.get_env("DEPLOY_ENV") == "production", do: raise("refusing to seed production")
    load_app()

    for repo <- repos(),
        do: {:ok, _, _} = Ecto.Migrator.with_repo(repo, fn _ -> Thirstr.Seeds.run() end)
  end

  def rollback(repo, version) do
    load_app()
    {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :down, to: version))
  end

  defp repos, do: Application.fetch_env!(@app, :ecto_repos)
  defp load_app, do: Application.load(@app)
end
