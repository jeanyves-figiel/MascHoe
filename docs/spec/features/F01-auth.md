# F-01 Auth & account

## Purpose
Create and access an account with zero identity leakage: no phone, no password.

## Scope
Beta: passkey, Apple, Google, email magic link, device link by QR, recovery phrase, pause, delete, export. Later: encrypted cloud backup UI polish.

## User stories
- As a new user I create an account in one tap with Face ID.
- As a user without passkey support I use Apple/Google/email.
- As a user with a new phone I get back in with my synced passkey or by scanning a QR on my old phone.
- As a user I can pause or delete my account instantly.

## Rules
- R-01.1 Passkey is the primary CTA. Apple/Google/Email secondary. **No phone number, no password, anywhere.**
- R-01.2 OIDC: store only `SHA-256(provider‖sub‖server_pepper)`. Never email/name from the provider. Apple "Hide My Email" accepted.
- R-01.3 Email magic link: email stored hashed; link valid 15 min, single use; response is always 202 (no account enumeration). An account made with Apple/Google/passkey can add a sign-in email later (`POST /me/email`, [RF-7](../required-fields.md)).
- R-01.4 One account per verified human (enforced at F-03, not here).
- R-01.5 Access token 15 min; refresh 30 d, bound to device key; rotate on use (re-use > 60 s after use revokes the device; within 60 s is a client race → 409, #116; the app runs one refresh at a time and signs out only on 401/403); revoke all on "Log out everywhere".
- R-01.6 Device link: old device shows QR (expires 120 s) → new device scans → old device confirms with biometrics → MLS adds new device to the user's groups.
- R-01.7 Recovery phrase (12 words, BIP-39) offered after verification, optional, shown once, never stored server-side. Used to re-derive the account key if all devices are lost; chats are not recoverable without encrypted backup.
- R-01.8 Max 5 devices per account.
- R-01.9 Pause: profiles hidden everywhere, chats kept, can resume anytime.
- R-01.10 Delete: confirm with biometrics + type "DELETE"; hard delete server data ≤ 24 h; client wipes local DB immediately; MLS leave all groups.
- R-01.11 Export (GDPR Art. 20): JSON + photos archive, encrypted to device key, ready ≤ 24 h.
- R-01.12 18+ confirmation on sign-up (checkbox); verification later enforces age.

## States
`anonymous → registered (unverified) → verified → paused ↔ verified → deleted`; `quarantined`, `banned` set by F-15.

## Interactions
| Action | Result |
|---|---|
| Tap "Continue with passkey" | OS passkey sheet → success → F-02 Basics |
| Cancel passkey sheet | Stay; show secondary options |
| Tap "I already have an account" | OS passkey login sheet (+ other methods below) |
| Email submit | "Check your inbox" screen; deep link opens app logged in |

## Edge cases
- Passkey created but network fails → retry silently 3×, then "Try again".
- OIDC account later adds passkey → both work.
- Device lost + no recovery phrase + no other device → email/OIDC login restores account (profiles, verification) but not chats.
- Banned account tries to re-register → blocked at verification (credential reuse detection, F-03 R-03.6).

## Privacy
No PII stored. Auth logs keep hashed IP 24 h.

## Acceptance criteria
- AC-01.1 New user reaches Basics in ≤ 2 taps via passkey.
- AC-01.2 No API or DB field contains a phone number or plaintext email.
- AC-01.3 Email link endpoint returns 202 for unknown and known emails with identical timing (±50 ms).
- AC-01.4 Deleting account removes all server rows within 24 h (verified by job).
- AC-01.5 QR link expires after 120 s and is single-use.
