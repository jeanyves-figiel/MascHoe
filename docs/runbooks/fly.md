# Runbook: Fly.io environments (D-03)

Created 2026-11-17 in Fly org `personal`, region `fra` (EU only, enforced by `scripts/check-fly-regions.sh`).

| App | Role | Notes |
|---|---|---|
| `thirstr-api-staging` / `thirstr-api-prod` | Phoenix API (`infra/fly/api-<env>.toml`) | public IPv6 + shared IPv4; deployed by digest only; staging serves the web client to testers |
| `thirstr-db-staging` / `thirstr-db-prod` | Postgres 16 + h3 machine, encrypted volume (1 GB / 3 GB) | image `registry.fly.io/thirstr-db-<env>:pg16-h3`, built by `infra-images.yml`; reachable at `thirstr-db-<env>.internal:5432` (6PN only) |
| `thirstr-valkey-staging` / `thirstr-valkey-prod` | Valkey, RAM only (`--save "" --appendonly no`), password auth | no volume by design (ADR-0001) |
| Tigris buckets `thirstr-public-staging` / `thirstr-public-prod` | public photos (private bucket, presigned URLs) | created as Fly add-ons, primary region `fra` |

## Secrets (set as Fly app secrets, never in git)
- API: `SECRET_KEY_BASE`, `ID_PEPPER`, `DATABASE_URL`, `VALKEY_URL`, `S3_*`.
- DB: `POSTGRES_PASSWORD`. Valkey: `VALKEY_PASSWORD`.
- Rotate: set new value on the dependent app and the API in one change, then restart both.

## GitHub (owner setup)
- Environments `staging` and `production`; `production` requires reviewer **jeanyves-figiel** (D-14).
- Secret `FLY_TOKEN` (org-scoped deploy token) in both environments. Workflows map it to `FLY_API_TOKEN`.

## Deploy
- Staging: automatic on push to `main` (`deploy-staging.yml`): build → SBOM → cosign sign → `flyctl deploy --image <digest>` → migrate (+ idempotent synthetic seed on staging) → `scripts/smoke.sh`.
- Prod: Actions → **Promote to production** → reason (+ optional digest). Checks the digest has been live on staging ≥ 30 min and staging smoke is green, waits for owner approval, deploys the same digest, smokes, rolls back to the previous image on failure.

## Checks
```sh
FLY_API_TOKEN=… scripts/fly-live-image.sh thirstr-api-staging   # digest + rollout time
scripts/smoke.sh https://thirstr-api-staging.fly.dev
```

## Known gaps (tracked in GitHub)
- Single Postgres machine per env: no replica, no PITR yet (ops.md backup/DR targets not met).
- `ID_PEPPER` is a Fly secret; spec wants it in an EU KMS.
- No SMTP provider yet: email magic links are not delivered on staging/prod.
- Tigris EU-only placement to confirm.
