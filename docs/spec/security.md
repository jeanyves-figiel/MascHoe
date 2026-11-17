# Threat model & security plan

Method: STRIDE per asset + attacker profiles. Owner: security lead. Review before each milestone.

## Assets (by sensitivity)
| Asset | Where | Sensitivity |
|---|---|---|
| Sexual orientation (= account existence) | everywhere | GDPR Art. 9 |
| Location (cells, exact pins) | Postgres/Valkey | critical |
| Messages, media, albums | device (CT on server) | critical |
| Health fields | device / E2EE | critical |
| Verification credential | server (blind-signed) | high |
| Public profile + photos | server/CDN | medium (public by intent, still Art. 9) |
| Auth keys, refresh tokens | device keystore | high |

## Attackers
| ID | Attacker | Goal | Key mitigations |
|---|---|---|---|
| A1 | Stalker / ex-partner | locate a person | cell-only location, k-anon, jitter, TTL pins, hide-from-hidden, block across profiles, velocity checks |
| A2 | Police in hostile country | identify/entrap gay users | Safe Mode, verified-only visibility, no server country lists, duress PIN, disguised icon, minimal server data |
| A3 | Bot/scam operator | mass spam, extortion | verification, attestation, quarantine, rate limits, first-message link block |
| A4 | Data broker / advertiser | harvest data | zero SDKs, no ads, no IDs in logs, anti-scrape (attested clients, rate limits) |
| A5 | Malicious insider | read data | E2EE, least privilege, audited moderator access, no plaintext chats exist |
| A6 | Server breach | dump DB | nothing sensitive in plaintext; hashed identifiers; exact pins not persisted |
| A7 | Legal compulsion | user data | warrant canary, transparency report, minimal retention ⇒ little to hand over |
| A8 | Device seizure | read phone | app lock, SQLCipher, duress PIN/decoy, panic wipe, disappearing messages |
| A9 | Scraper with real accounts | build profile dataset | attestation, per-account view caps (300 profiles/h), random pagination tokens, no public web profiles |

## Key management
- Account root key: generated on device, stored in Secure Enclave/StrongBox; never leaves except as recovery phrase (user-held).
- Device keys: per device, attested at registration.
- MLS: OpenMLS, ciphersuite `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`; key packages rotated; forward secrecy + post-compromise security via commits ≥ weekly.
- Media: per-file AES-256-GCM key in MLS message; album keys rotated on revoke.
- Server secrets: Vault/sealed secrets; pepper for hashes in HSM-backed KMS (EU).
- TLS 1.3 only, HSTS, certificate pinning in app (backup pins).

## Controls checklist (beta gate)
- [ ] Dependency scanning + SBOM in CI; Renovate.
- [ ] SAST (Sobelow for Phoenix, ESLint security, cargo-audit).
- [ ] Secrets scanning on GitHub.
- [ ] Logs: no account IDs, no IPs (hashed 24 h), no message metadata beyond counters.
- [ ] Rate limits + attestation enforced at gateway.
- [ ] Backups encrypted, EU-only, 30 d.
- [ ] Admin access via hardware keys (FIDO2) + just-in-time grants.
- [ ] External pentest + crypto audit (MLS integration, verification protocol) before public beta.
- [ ] Bug bounty (private) at closed beta.
- [ ] Incident response runbook; 72 h GDPR breach notification.

## Abuse tests (automated, see testing.md)
- Trilateration harness (A1), scraping harness (A9), quarantine invisibility (A3), Safe Mode leak checks (A2), log PII grep (A4/A6).
