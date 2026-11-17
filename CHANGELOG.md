# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **B1 Explore** (issue 37, full beta build), server:
  - Profiles: field catalogue with per-field visibility (`Thirstr.Profiles.Fields`). Values set to My chats / Only me never reach the server, and health fields are never public. Also: completeness ring, Sport/Friends profiles, photo replace, reorder and remove, NudeNet-label classifier with a DEV stand-in, and bio checks for contact details and links.
  - Explore: grid, map (H3 heat cells, pins and avatars by bbox) and the active-now tray. Includes all R-04.9 exclusions, per-mode filters, distance buckets, sparse-area widening, k-anonymity widening (every minute), and Safe Mode / unverified count-only maps.
  - Location: account-wide levels Hidden, City, Area and Exact. Exact pins live in RAM only, with TTL, audience and 10–20 m jitter. Also: incognito, hide-from-hidden, a velocity anti-bot signal and a Safe Mode override.
  - Social: profile view, taps (daily cap, mutual), blocks, hides and Now status.
  - Settings: server-enforced settings and the Safe Mode report.
  - Map tiles: `/v1/tiles` proxy with the Pop dark style.
  - New tables: taps, blocks, profile_hides, contacts, moderation_actions and now_status.
- **B1 Explore** (issue 37, full beta build), app:
  - Pop design system: tokens, Bricolage Grotesque and the floating pill tab bar (Explore, Tonight, Chats, Me).
  - Explore: map (MapLibre native, maplibre-gl on web) and grid, mode switch, filters sheet, location sheet (S-30), long-press quick actions.
  - Profile view (S-20) with Tap, Message, Share, Hide, Report and Block.
  - Me: profile switcher, completeness, preview-as, Now and incognito.
  - Edit profile with photo editor and per-field visibility. Device-only values are stored locally.
  - Settings with search, Safe Mode and account actions. Also: blocked list and taps list.
- `docs/spec/beta-build-plan.md`: milestones B1–B4 and beta implementation choices.
- iOS TestFlight pipeline (#31): `ios-testflight.yml` (EAS Build + auto-submit, app points at staging), `apps/mobile/eas.json`, `app.config.js` (passkey associated domain from API host), runbook `docs/runbooks/ios.md`.
- Native sign-in on iOS: Sign in with Apple (no name/email scopes) and native passkeys (`react-native-passkey`). Google and email link hidden on native builds until configured (`EXPO_PUBLIC_AUTH_GOOGLE`, `EXPO_PUBLIC_AUTH_EMAIL`).
- API: `GET /.well-known/apple-app-site-association` (`webcredentials`, from `APPLE_TEAM_ID`; 404 until set). Staging now sets the Team ID.

### Fixed
- Release scripts `bin/migrate` and `bin/server` committed without the executable bit, so the Fly release command failed on the first staging deploy.
- Release node name built from `FLY_IMAGE_REF`; a digest-pinned image made it invalid and the app crash-looped on staging. Node is now `<app>@<private IPv6>`.

### Changed
- api.md: profiles, location, explore (bbox `w,s,e,n` replaces `bbox_cells`), settings, taps and tiles endpoints. data-model.md: B1 columns, tables and Valkey keys.
- Web build copies the maplibre-gl worker (`scripts/copy-maplibre-worker.js`). DEV compose uses `npm run build:web`.
- Old single-screen Explore placeholder removed.
- api.md: account & onboarding endpoints, logout, delete confirmation, session shape, install header.
- data-model.md: passkeys, refresh_tokens, cities tables; account birthdate/onboarding fields; H3 cells stored as bigint.
- ops.md: Phoenix app layout, Fly hostnames until a domain exists (host is env config only), org `personal` for beta, workflow details.
- ADR-0001 amendment: DEV object storage SeaweedFS (MinIO community images discontinued).
- ops.md: Fly deploy token variable is `FLY_TOKEN`.
- Hosting (D-03): Fly.io EU regions for beta (was Hetzner); ops.md infra, workflows and ADR-0001 updated; CLOUD Act risk noted in threat model; review before public launch.
- App renamed **Thirstr** (was working name MascHoe) across concept and spec docs; D-01 updated with domain targets and trademark-clearance task.
- Spec sign-off round 1 (`docs/spec/decisions.md`, D-01…D-14): MascHoe final name; Swiss entity, Hetzner hosting; invite-only beta (~500) seeded in Zurich/Berlin/Paris; en/fr/de at beta; Exact pin TTL 30 min/1 h/2 h/4 h; party hosting verified-only without account-age minimum; owner sole moderator with auto-hide control; Yoti age fallback; owner-only prod approval.
- Location: Area default ~200 m (H3 res 9, k-anonymity fallback); Hidden/incognito only for verified users; new setting "Hide me from hidden users".
- Mockups/design: unified 4 tabs (Explore, Tonight, Chats, Me); Hookup/Sport/Friends mode switch on Explore replaces intent chips and Activities tab; separate Map screen retired.
- Concept §6.2: exact pins visible to hidden/incognito viewers too (no give-to-get); pin owner's audience setting is the only filter.

### Added
- Monorepo bootstrap (#20; follow-ups #24–#27): `server/` Phoenix API, `apps/mobile/` Expo app (iOS/Android/web), `core/` Rust crate (H3 cells, same output as server h3-pg), `infra/`, `design/tokens.json`.
- DEV stack `docker compose up` on https://localhost:7443: Caddy TLS, Phoenix, Postgres 16 + h3, Valkey (RAM only), SeaweedFS S3, Mailpit, mock push (content-free payload check), Protomaps tile server; 5 000 seeded fake profiles in Zurich/Berlin/Paris.
- F-01 Auth: passkey register/login (WebAuthn, attestation none, random user handle), Sign in with Apple/Google (ID token verified, only peppered subject hash stored; DEV issuer for localhost), email magic link (15 min, single use, always 202, hashed address), 15 min access + 30 d rotating refresh with theft revocation, max 5 devices, log out (this device / everywhere), pause/resume, delete (type DELETE, rows gone immediately, objects purged by job).
- F-02 Onboarding S-01…S-06: Welcome live blurred counts (R-02.2 rounding), Create account (passkey first, 18+ checkbox), Basics (name, birthday, I am, Here for; under-18 deletes account and flags install 30 d), Location (Area default, Hidden only after verify, cells computed on device, city picker fallback), Main photo (presigned upload, inline classifier result, 4 optional slots), Verify → Later = browse-only with banner; server-side resume at last step. Strings en/fr/de.
- CI/CD: `ci.yml` (mix format/credo/sobelow/deps.audit/tests, cargo fmt/clippy/test/audit, tsc/eslint/jest/web build, image build, EU-region check, ChangeLog check, gitleaks), `deploy-staging.yml` (build, SBOM, cosign, deploy by digest, smoke), `promote-prod.yml` (staging ≥ 30 min + smoke, owner approval, same digest, auto-rollback), `nightly.yml`, `infra-images.yml`; PR template.
- Fly.io EU infra: `thirstr-{api,db,valkey}-{staging,prod}` in `fra`, Tigris buckets, secrets; runbook `docs/runbooks/fly.md`.
- `docs/spec/`: pre-build technical docs — threat model & security plan, CI/CD/environments/ops (monorepo, DEV/staging/prod, trunk model, workflows, SLOs, DR), test strategy (AC traceability, abuse/privacy tests, beta release criteria), design system (tokens, copy, i18n, a11y), admin & moderation console, privacy-preserving metrics.
- `docs/spec/`: beta specification — ADR-0001 stack (Elixir/Phoenix, Postgres+h3, Valkey, OpenMLS, React Native + Rust core, MapLibre; accepted), glossary, data model, API & realtime contract, screen inventory, feature specs F-01…F-18, integration specs I-01…I-03.
- `docs/concept/onboarding-and-design.md`: login options (passkey default, Apple/Google/email, no phone), 6-step onboarding < 60 s, progressive profiling, design system (mode colours, type, nav), design audit. Mockups: onboarding row (Welcome, Sign up, Basics, Location, Photo, Verify).
- Concept: share posts from X, Bluesky, OnlyFans, JustFor.Fans to members (share sheet, device-side E2EE preview, blurred explicit, verified linked accounts, anti-bot guardrails).
- `docs/concept/profile-and-settings.md`: own-profile fields with per-field visibility (Public / Verified / My chats / Only me), up to 3 profiles, Preview-as, full settings tree. Mockups: Me + Settings boards.
- Concept §6.2: Area default ~500 m (H3 res 8, k-anonymity fallback to res 7); give-to-get rule for exact pins; viewing rules for grid/map.
- Mockups canvas: 7 new v1 screens (map-first home, Tonight board, party hosting, Activities, venue check-in, profile switcher + private notes, verification).
- Concept MVP scope: map-first home, social hookup features and Activities moved into v1 (owner decision).
- Concept: approved features: group/party hosting, private profile notes, disappearing chats default, multiple profiles, venue check-in, Tonight board.
- Concept: Activities intent (gym buddies, sports): SFW activity profile, activity posts, open-to-more flag, queer clubs/teams, gym venues.
- Concept: home screen = map first with Active-now card tray and Map/Grid toggle (owner decision); mockup added to canvas.
- Concept v0.3: audience = anyone who identifies as a man (incl. trans, non-binary); App Store + Play distribution; photo policy (1 vanilla main + 4 spicy public, AI-checked; unlimited private albums incl. video, E2EE); worldwide day-1 launch with density mitigations.
- Concept v0.2: hookup-first positioning (friends/chat secondary); user-chosen location precision (Hidden / City / Area default / Exact opt-in with auto-expiry, audience control, off in Safe Mode); anti-bot section §9.1 (verification gate, device attestation, shadow quarantine, creator label); map + anti-bot moved into MVP; link to key-screen mockups.
- `docs/concept/product-concept.md`: product concept v0.1 — competitor scan (Grindr, Scruff, Romeo, Hornet, Jack'd, Taimi, Feeld, Sniffies), privacy-incident lessons, privacy-by-design architecture (E2EE, H3 cell location, local-first), verification without doxxing, hostile-country Safe Mode, moderation, no-ads monetization, MVP scope, moat/retention, "mistakes not to repeat" (complaint → rule), interconnection with other apps evaluation, risks.
- `CHANGELOG.md`.
