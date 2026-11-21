# F-03 Verification

## Purpose
Prove "real human, 18+, matches photos" without storing identity. Primary anti-bot gate.

## Rules
- R-03.1 Liveness runs **on device**: randomized 3-step challenge from server nonce (turn left/right, blink, smile, look up). Passive deepfake/injection detection (camera stream integrity, App Attest/Play Integrity).
- R-03.2 Photo match on device: selfie embedding vs main photo face embedding; threshold set for FAR ≤ 1 %. No-face main photo allowed: match against any public photo with a face, else badge shows "face-verified" without photo-match claim.
- R-03.3 Age estimation on device; if estimate < 23 → require second method: third-party zero-retention age check (boolean only) per jurisdiction.
- R-03.4 Result → client blinds a token → server signs (blind signature, RSA-BSSA RFC 9474) after verifying signed liveness result + attestation → client unblinds → redeems. Server learns "this account is verified" but cannot link the liveness session data (none stored) to anything else.
- R-03.5 Face templates and images never leave the device; deleted after check.
- R-03.6 Duplicate-human control: device computes a salted, locality-sensitive face hash; server stores only HMAC(LSH) buckets of banned accounts to block re-registration of banned users. Normal users' hashes are not stored.
- R-03.7 Re-verification required when main photo changes face materially, every 12 months, or on moderation request.
- R-03.8 Unlocks: appear in grid/map/Tonight/venues, start chats, post Now/Tonight/parties/activities, Hidden mode, exact pin, vouch.
- R-03.9 Unverified: browse grid/map (cards only, no distance < 1 km), read profiles, reply to messages received.
- R-03.10 3 failed attempts → 24 h cooldown + manual review option (video call with trust & safety, opt-in, nothing recorded).

## States
`unverified → challenge → passed → verified (epoch n) → expired → re-verify`.

## Acceptance criteria
- AC-03.1 Network capture shows no image/video/biometric template leaving device.
- AC-03.2 Unverified account cannot POST /mls/messages to a profile that hasn't messaged it (403 not_verified).
- AC-03.3 Replay of a used nonce fails.
- AC-03.4 Banned user re-verifying on new account with same face is blocked ≥ 95 % in test set.
