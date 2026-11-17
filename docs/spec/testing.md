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

## Release criteria (closed beta)
- 100 % of Milestone-1 ACs automated or manually signed off.
- 0 open critical/high security findings.
- Abuse harnesses green 7 consecutive nights.
