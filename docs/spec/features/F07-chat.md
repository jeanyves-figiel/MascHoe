# F-07 Chat

## Purpose
Fast, private 1:1 and group messaging (party guest chats). E2EE, stored on device.

## Rules
- R-07.1 Protocol: MLS (RFC 9420) via OpenMLS. 1:1 = 2-member group (+ each side's devices). Party/activity chats = group (max 50).
- R-07.2 Starting a chat requires sender verified (F-03) unless replying to an inbound message.
- R-07.3 First message from a new contact: text only, max 500 chars, **no links/handles/phone/email** (client blocks + server rate signals). Links allowed once the other side replied.
- R-07.4 Message types: `text`, `media` (F-08), `album.grant`, `album.revoke`, `location.share` (TTL), `profile.private` (F-06 R-06.6), `link.preview` (I-01), `quick_reply`, `party.invite`, `checkin.started` (system), `reaction`.
- R-07.5 Quick replies: "Yes 🔥", "Not now", "Later?", "Pics?", "Host?", "Can travel" + 3 custom (Settings).
- R-07.6 Disappearing messages: per chat 24 h / 7 d (default) / never; timer starts on read; both sides see setting; change creates a system message.
- R-07.7 Read receipts + typing: symmetrical; off for user → they don't see others'.
- R-07.8 Inbox: sections "New" (unreplied inbound), "Chats", "Parties & groups"; sort by last activity; star, mute, archive, delete (local + leave group).
- R-07.9 Chat header: avatar, name, verified, distance bucket, Now status; actions: video call (Later), profile, ⋯ (block, report, disappearing timer, share location, start check-in).
- R-07.10 Unsolicited explicit media from someone you haven't replied to → blurred per Settings (blur/allow/block).
- R-07.11 Franking: each message carries commitment; report sends plaintext + opening to moderation (F-15).
- R-07.12 Delivery: online → realtime `message.new`; offline → content-free push; server deletes ciphertext on ack from all devices or after 30 d.
- R-07.13 Multi-device: all devices in user's MLS leaf set; new device added only via F-01 R-01.6.
- R-07.14 Offline compose: queued, sent on reconnect; optimistic UI.
- R-07.15 Taps: separate "Taps" row at top of inbox; tap back = mutual → suggests "Say hi".

## Edge cases
- Recipient blocks sender mid-chat → sender sees "Message not delivered" without revealing block (generic).
- Recipient deleted account → chat archived "This profile is gone".
- Key package exhausted → client uploads 100 on each launch; fallback last-resort package.

## Acceptance criteria
- AC-07.1 Server DB/logs contain no plaintext message content in any env.
- AC-07.2 p95 delivery online < 500 ms intra-EU.
- AC-07.3 First message containing URL from new contact is blocked client-side and rejected (flag) server-side by franking-based heuristics on report only (no server scanning).
- AC-07.4 Disappearing timer deletes on both devices within 1 min of expiry.
