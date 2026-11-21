# Runbook: metrics & alerts (SR-07, #147)

## Where
- API machines export Prometheus metrics on the internal port `9091` (`/metrics`, 6PN only, not in `[http_service]`). Fly managed Prometheus scrapes it via `[metrics]` in `infra/fly/api-<env>.toml`.
- Dashboards + alerts: Fly managed Grafana (`fly-metrics.net`, org `personal`), data source "Prometheus on Fly". EU only.
- Content-free by design: counts, ages, durations, route templates, status codes. No ids, names, pairs or coordinates (test `metrics_test.exs`).

## Metrics
| Metric | Meaning |
|---|---|
| `phoenix_router_dispatch_stop_duration{route,status}` | API latency histogram (ms) per route template + status |
| `phoenix_router_dispatch_exception_count{route}` | crashes per route |
| `phoenix_socket_connected_count{result}` | realtime connects (ok / error) |
| `thirstr_repo_query_total_time`, `_queue_time` | DB query time; queue time = pool pressure |
| `vm_memory_total`, `vm_total_run_queue_lengths_total`, `vm_system_counts_process_count` | BEAM health |
| `oban_job_stop_count{worker,state}`, `oban_job_exception_count{worker}`, `oban_job_stop_duration{worker}` | jobs done / failed / time |
| `thirstr_oban_jobs_count{queue,state}`, `thirstr_oban_jobs_oldest_available_s{queue}` | queue depth and wait |
| `thirstr_chat_backlog_count`, `thirstr_chat_backlog_oldest_s` | ciphertext waiting for offline devices; oldest age |
| `thirstr_push_send_count{platform,outcome}` | push sends: `ok`, `retry`, `skipped` |
| `thirstr_valkey_fallback_count` | rate limits served by the per-node fallback (Valkey unreachable) |
| `thirstr_db_size_bytes` | database size (volume is 3 GB on prod) |

## Alert rules (Grafana → Alerting, contact point = owner email/phone)
| Alert | Rule | For | First steps |
|---|---|---|---|
| API errors | `sum(rate(phoenix_router_dispatch_stop_duration_count{status=~"5.."}[5m])) / sum(rate(phoenix_router_dispatch_stop_duration_count[5m])) > 0.02` | 5 m | `fly logs -a thirstr-api-prod`; last deploy? roll back with "Promote to production" (previous digest) |
| API slow | `histogram_quantile(0.95, sum by (le) (rate(phoenix_router_dispatch_stop_duration_bucket[5m]))) > 500` | 10 m | DB `queue_time` high → pool/DB CPU; else hot route |
| Push failing | `sum(rate(thirstr_push_send_count{outcome="retry"}[10m])) / sum(rate(thirstr_push_send_count[10m])) > 0.05` | 10 m | APNs key / FCM account valid? Apple status page |
| Jobs stuck | `max(thirstr_oban_jobs_oldest_available_s{queue="push"}) > 120` or `{queue="default"} > 600` | 5 m | machine down? `oban_jobs` executing too long → Lifeline |
| Chat backlog old | `thirstr_chat_backlog_oldest_s > 86400 * 25` | 1 h | devices offline near the 30 d sweep (normal), or pull broken (check `/mls/messages` errors) |
| Valkey down | `increase(thirstr_valkey_fallback_count[5m]) > 0` | 5 m | `thirstr-valkey-prod` machine state; restart |
| DB filling | `max(thirstr_db_size_bytes) > 2.2e9` | 30 m | extend volume (Fly volume extend, no downtime) |
| Machine memory | `max(vm_memory_total) > 400e6` (512 MB VMs) | 10 m | scale VM memory (SR-12) |
| Backups stale | DB machine log `backup-loop: … FAILED`, or no `backup ok` in 26 h | — | `docs/runbooks/db-backups.md` › Check |

Set up once per environment; staging alerts go to a muted contact point.
