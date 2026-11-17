# Beta build plan: full feature set in first TestFlight

Status: accepted · 2026-11-17 · Owner ask: "Build it all in the first. Functional application from the get go." Tracking issue: see ChangeLog.

Every F-01…F-18 / I-01…I-03 rule in beta scope ships before the closed beta opens. Work lands as a short series of PRs on `main` (each auto-deploys staging + uploads a TestFlight build); testers are invited only once the last one is green.

## Milestones (PRs)
| PR | Scope | Specs |
|---|---|---|
| B1 Explore | tab shell, Pop theme, profiles (all fields, 3 kinds, per-field visibility, preview-as, completeness), photos 5 slots + reorder, location levels (Hidden/City/Area/Exact pin/incognito/hide-from-hidden, k-anon, velocity), Explore map + grid + tray + filters, profile view, taps, block, hide, map tile proxy | F-04, F-05, F-06, F-17 (visibility subset), F-18 badges |
| B2 Chat | MLS delivery service, key packages, realtime socket, inbox, 1:1 + group chat, disappearing, quick replies, read/typing, media + private albums (E2EE blobs), private notes, push (APNs/FCM, content-free), notification settings | F-07, F-08, F-16, F-06 R-06.6/R-06.9 |
| B3 Social | Now status, Tonight board, parties (requests, seats, guest chat, address), Activities + clubs, venues + check-in + here-now | F-09, F-10, F-11, F-12 |
| B4 Trust & safety | Verification (liveness + blind credential), reports + franking, shadow quarantine + signals, admin console, vouches, linked accounts, Safe Mode, check-in + trusted contacts + panic, app lock + duress, settings tree, GDPR export, device link | F-03, F-13, F-14, F-15, F-17, F-18, I-01, I-02, F-01 rest |

## Beta implementation choices (ADR-0001 amendments)
| Topic | ADR-0001 target | Beta implementation | Why / exit |
|---|---|---|---|
| MLS client | OpenMLS (Rust, UniFFI) | **ts-mls** (RFC 9420, TypeScript, noble crypto), ciphersuite `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519` | Same protocol and wire format; no native build risk on Hermes. Swap to OpenMLS core when audited bindings exist; groups re-created on migration. |
| MLS on Hermes | — | ts-mls `nobleCryptoProvider` still calls `crypto.subtle` (via @hpke/core). Hermes has none, so `src/crypto/subtleShim.ts` implements the needed subset (X25519, Ed25519, HKDF/HMAC-SHA256, AES-GCM, SHA digests) on noble. Installed only when `crypto.subtle` is missing | Pure JS, audited noble libraries. Unit test runs a full 1:1 flow on the shim. |
| Chat media | H.265 transcode, videos, voice notes | Photos (≤ 20 MB) re-encoded on device (drops EXIF/GPS), AES-256-GCM. Video and voice notes follow in a later build. Receiver blur (R-08.7) treats every photo from someone you haven't replied to as possibly explicit until the on-device classifier ships. Watermark (R-08.5) and pre-send CSAM hash (R-08.8) not in beta | Small closed beta; classifier work tracked separately. |
| Album revoke | lazy re-encrypt | Eager: revoke sends `album.revoke`, re-encrypts every item under new keys, deletes the old blobs, re-grants remaining viewers | Simple and meets AC-08.2. |
| Device storage | SQLCipher via Rust core | `expo-sqlite` with SQLCipher enabled; key in Keychain/Keystore (`expo-secure-store`) | Same at-rest guarantee. |
| Tokens | Keychain | `expo-secure-store` on native, memory + localStorage on web (DEV only) | |
| Map | MapLibre + self-hosted Protomaps | `@maplibre/maplibre-react-native` (native) / `maplibre-gl` (web). Tiles, glyphs fetched **through our API** (`/v1/tiles/*`, cached, no auth/user id forwarded) from an OpenMapTiles-schema upstream (default OpenFreeMap) | Third party sees only our server, never users. Exit: PMTiles in Tigris behind the same path. |
| Photo classifier | self-hosted GPU model | self-hosted **NudeNet** (ONNX, CPU) service `thirstr-classifier-{env}` on Fly, called server-side; mapping in F-15 R-15.10 table below | Self-hosted, no third party. |
| Liveness | Core ML / TFLite | iOS **Apple Vision** (local Expo module `thirstr-face`): face yaw/pitch, eye and mouth landmarks per challenge frame; frames never leave device and are deleted | Built-in OS framework, no SDK. Android + web: verification not offered in beta (iOS-only closed beta). |
| Photo match / age estimate | on-device embeddings | not in beta: badge reads "face-verified" without photo-match claim (R-03.2 fallback); age = birthdate + 18+ checkbox; Yoti fallback deferred (#4) | No on-device face embedding in Vision. |
| Anonymous credential | RSA-BSSA (RFC 9474) | Chaum **RSA-FDH blind signature** (3072-bit, SHA-384 full-domain hash) | Same unlinkability property; RFC 9474 encoding later. |
| Attestation | App Attest / Play Integrity on every request | App Attest attestation verified once per device at sign-in when available; device marked `attestation_ok`; unattested devices keep read access but count as a bot signal | Full per-request assertion before public beta (#11). |
| Push | direct APNs/FCM | direct APNs (token auth, `APNS_KEY_P8` secret), generic visible alert (api.md › Push payloads); FCM when Android ships | Owner adds APNs key. Preview levels need the notification service extension. |
| Private notes sync | E2EE sync across own devices | Device-only in beta (one device per account) | Sync with device linking (B4). |
| Admin console | separate LiveView app behind VPN, FIDO2 | `/admin` LiveView in the API app, owner-only passkey login (R-AD.12), not linked anywhere, `ADMIN_ENABLED` env | VPN + separate app before public beta. |
| Trusted-contact page | separate web page | `GET /t/{token}` static page from API; key in URL fragment, decrypts in browser | |
| Live location / panic power-button | OS hooks | in-app SOS only (long-press); power-button gesture not available to third-party iOS apps | |

## Classifier mapping (R-15.10, NudeNet labels)
| Slot | Rejected if any detection ≥ 0.6 |
|---|---|
| 0 main (all kinds) | `*_GENITALIA_EXPOSED`, `ANUS_EXPOSED`, `BUTTOCKS_EXPOSED`, `FEMALE_BREAST_EXPOSED`; also `no_person` if no face/body detected |
| 1–4 Now/Friends | `*_GENITALIA_EXPOSED`, `ANUS_EXPOSED` |
| 1–4 Sport | same as main + `*_GENITALIA_COVERED` (> swimwear, AC-11.1) |
Scores 0.4–0.6 → `pending_review` (A-03 queue), auto-hidden until reviewed (R-15.13).

## Out of beta (unchanged "Later")
Video calls, travel planner, Plus billing, open protocol, web client for end users (web build stays a DEV tool).
