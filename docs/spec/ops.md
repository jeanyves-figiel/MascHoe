# CI/CD, environments & operations

## Repos & layout (monorepo)
```
/apps/mobile        React Native (Expo bare) app
/apps/share-ext     iOS share extension / Android share target glue
/core               Rust crate (MLS, H3, crypto, storage) + UniFFI bindings
/server             Elixir umbrella: api, realtime, mls_ds, jobs, admin
/infra              Terraform (EU cloud), k8s manifests (Helm/Kustomize)
/design             tokens.json, icons, copy/strings
/docs               concept, spec, adr
```

## Environments
| Env | URL | Data | Deploy |
|---|---|---|---|
| DEV | `https://localhost:7443` | seeded fake data | `docker compose up` (phoenix, postgres+h3, valkey, minio, mailpit, mock-push, tile server) |
| Staging | `https://staging.<domain>` | synthetic + testers | auto on squash-merge to `main` |
| Prod | `https://api.<domain>` | real | manual workflow **"Promote to production"** (same image digest as staging), owner OK per change; owner is the only required reviewer |

## Trunk model
1. Branch off `main` → PR (template: summary, linked spec IDs, ChangeLog entry, screenshots ≤ 800 px).
2. CI must pass: format, lint, unit, integration, AC tests touched, security scans, ChangeLog present.
3. Squash-merge → build image `server:<sha>`, mobile build to TestFlight/Internal track → deploy staging.
4. Validate on staging (smoke + AC checks).
5. Run "Promote to production" (workflow_dispatch, input: image digest, requires environment approval by owner).

## GitHub Actions workflows
| Workflow | Trigger | Jobs |
|---|---|---|
| `ci.yml` | PR | server (mix format/credo/sobelow/test), core (cargo fmt/clippy/test/audit), mobile (tsc/eslint/jest), changelog-check, secret scan |
| `deploy-staging.yml` | push main | build+sign images (cosign), SBOM, push to EU registry, helm upgrade staging, smoke tests |
| `promote-prod.yml` | manual | verify digest deployed on staging ≥ 30 min & smoke green → environment `production` approval → helm upgrade prod → smoke → auto-rollback on failure |
| `mobile-release.yml` | tag `app-v*` | EAS/fastlane build → TestFlight / Play internal; store submission manual |
| `nightly.yml` | cron | abuse harnesses (trilateration, scraping), dependency updates |

## Infra (EU)
- k3s cluster 3 nodes per env (prod: 2 AZs), Postgres managed or Patroni HA, Valkey (no persistence), S3-compatible storage, EU CDN.
- Observability: OpenTelemetry → Grafana stack; SLOs: API availability 99.9 %, grid p95 < 300 ms, message p95 < 500 ms.
- Backups: Postgres PITR 7 d + daily encrypted snapshots 30 d; restore drill monthly.
- DR: RPO 15 min, RTO 4 h; secondary EU region cold standby.
- On-call: alerting to owner/devs; runbooks in `/docs/runbooks` (to write per service).
