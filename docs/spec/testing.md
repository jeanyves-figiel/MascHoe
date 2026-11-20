# Test strategy

## Levels
| Level | Tooling | Scope | Gate |
|---|---|---|---|
| Unit | ExUnit, cargo test, Jest | rules R-xx logic | PR |
| Integration | ExUnit + Testcontainers (Postgres+h3, Valkey) | API endpoints, channels | PR |
| Contract | OpenAPI schema from api.md, generated client tests | app ↔ server | PR |
| E2E mobile | Detox (RN) on iOS sim + Android emu | onboarding, explore, chat, party flows | main |
| Crypto | OpenMLS interop vectors, property tests | MLS, media keys, blind signatures | PR |
| Abuse | custom harnesses | trilateration (AC-05.1), scraping (A9), quarantine (AC-15.1), Safe Mode leaks | nightly + pre-promote |
| Load | k6 | 100k concurrent sockets, 5k grid req/s, 20k msg/s per cluster | pre-milestone |
| Privacy | log/payload grep for PII, push payload inspection | AC-07.1, AC-16.1 | nightly |
| Accessibility | axe/RN a11y lint + manual VoiceOver/TalkBack | all screens | milestone |
| Usability | moderated sessions n=10 per milestone | onboarding < 60 s, 3-tap message | milestone |

## Traceability
- Each AC-xx maps to ≥ 1 automated test tagged `@ac AC-xx.n`; CI report lists AC coverage per spec.
- Untestable ACs flagged in spec with "manual".

## Test data
- Seed generator: 5k fake profiles across 3 cities with realistic cell density, no real photos (generated avatars).
- Never use production data in DEV/staging.

## Chat test bot (staging only, #109)
A simulated user so testers can try chat end to end from the TestFlight build.
- **Who**: one account flagged `accounts.test_bot`, profile "Testbot 🤖", bio starts with "TEST ACCOUNT", verified, age 30, all lenses, area location at Zurich Altstetten (47.3914, 8.4887), no photo (listed like seeded profiles), Now status "Test bot · write help". Nobody else can be flagged.
- **E2EE**: the bot is a normal chat client (`apps/testbot`, Node). It bundles the app's own `apps/mobile/src/chat/mls.ts` + `bytes.ts`, holds its MLS keys on a private Fly volume, uploads key packages and only ever sends/receives ciphertext through the same API as the app (`/mls/*`). The server never sees plaintext.
- **Session**: `POST /v1/testbot/session` with header `x-testbot-key` = `TESTBOT_KEY`. Creates/refreshes the account, removes earlier bot devices (their key packages and queued ciphertext go with them) and returns tokens + `profile_id`. 404 when `TESTBOT_KEY` is unset/short, the key is wrong, or `DEPLOY_ENV` is `prod`/`production`. The bot refreshes tokens like the app and only asks for a new session when refresh fails.
- **Behaviour**: on each message: Delivered receipt, Read receipt (~1 s), typing, then the reply. Replies in German by default. Commands (first word): `help`, `lang de|pt|fr|es|it|en|ja`, `mix` / `mix off` (rotate languages), `long` (long paragraph, translation test), `burst N` (≤ 10 messages), `later N` (reply after N s, ≤ 600, push test), `quick` (built-in quick reply with `k`), `echo <text>`, `noread` / `read on|off`, `receipts on|off`, `status`. Non-text (photos etc.): short text reply. 1:1 only; party/club chats are ignored. A message it can't decrypt for 10 min triggers the R-07.20 resync.
- **Run**: Fly app `thirstr-bot-staging` (fra, 256 MB, volume `botdata` at `/data`), secret `TESTBOT_KEY` (same value on `thirstr-api-staging`). Deployed by `.github/workflows/testbot.yml` on main pushes touching the bot. No prod app exists, and the prod API refuses the endpoint.
- **Tests**: `apps/testbot` `npm test`: reply rules, and an end-to-end run of the built bot against a mock delivery service with a second client (the app's MLS code): join, Delivered, Read, German reply, `lang pt` → Portuguese, `quick` → `k`. Server: `test/thirstr_web/test_bot_test.exs`.

## Release criteria (closed beta)
- 100 % of Milestone-1 ACs automated or manually signed off.
- 0 open critical/high security findings.
- Abuse harnesses green 7 consecutive nights.
