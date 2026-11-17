# Thirstr

Privacy-first dating app for men (incl. trans and non-binary). Spec: [`docs/spec/`](docs/spec/README.md) · Concept: [`docs/concept/`](docs/concept/) · Changes: [`CHANGELOG.md`](CHANGELOG.md).

## Monorepo
| Path | What |
|---|---|
| `apps/mobile` | React Native (Expo) app; web build used on DEV/staging |
| `apps/share-ext` | Share extension glue (I-01, later) |
| `core` | Rust client core (H3 cells now; MLS, SQLCipher, media crypto later) |
| `server` | Elixir/Phoenix API |
| `infra` | Fly configs, Postgres+h3 image, DEV Caddy/S3/mock-push/tiles |
| `design` | Design tokens |
| `docs` | Concept, spec, ADRs, runbooks |

## DEV: https://localhost:7443
```sh
docker compose up --build
```
- App (Expo web build) at `/`, API at `/v1`, Mailpit at `/mail`, mock push log at `/push`, tiles at `/tiles`.
- Browser S3 endpoint `https://localhost:7444` (presigned photo uploads).
- TLS from Caddy's local CA: accept the warning once for 7443 **and** 7444, or run `docker compose exec caddy caddy trust`.
- Seeded: 5 000 fake profiles in Zurich, Berlin, Paris (no real data, ever).
- Apple/Google buttons use a DEV-only OIDC issuer; passkeys work on `localhost`.
- Live app reload: `cd apps/mobile && npx expo start --web` (point `EXPO_PUBLIC_API_URL=https://localhost:7443`).

## Tests
```sh
# server (needs Postgres+h3 and Valkey, see ci.yml)
cd server && mix test
cd apps/mobile && npm test && npm run typecheck && npm run lint
cd core && cargo test
```

## Ship (trunk model, ops.md)
Branch off `main` → PR (ChangeLog entry required) → squash-merge → auto-deploy **staging** (`https://staging.thirstr.fun`) → validate → run **Promote to production** (same image digest, owner approval). Runbook: [`docs/runbooks/fly.md`](docs/runbooks/fly.md).
