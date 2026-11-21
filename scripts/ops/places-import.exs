# F-12 R-12.9 (#113): run on a Fly machine via `bin/thirstr rpc`. Queues the OSM import job
# (same as admin › Places › Import now) or prints the latest import row. `action` comes from the
# eval binding: env vars set on the rpc client never reach the server node.
alias Thirstr.Repo
case binding()[:action] do
  "start" ->
    {:ok, job} = Oban.insert(Thirstr.Jobs.PlaceImport.new(%{}))
    IO.puts("queued job #{job.id} enabled=#{Thirstr.Places.OsmImport.enabled?()}")
  _ ->
    %{rows: rows} = Repo.query!("SELECT id, started_at, finished_at, added, updated, removed, error FROM place_imports ORDER BY id DESC LIMIT 1")
    %{rows: [[n]]} = Repo.query!("SELECT count(*) FROM venues WHERE NOT hidden")
    case rows do
      [[id, st, fin, a, u, r, e]] -> IO.puts("import #{id} started=#{st} finished=#{fin || "running"} added=#{a} updated=#{u} removed=#{r} error=#{e || "none"} venues=#{n}")
      [] -> IO.puts("no import yet venues=#{n}")
    end
end
