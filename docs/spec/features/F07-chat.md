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
- R-07.7 Read receipts + typing: symmetrical; off for user → they don't see others'. Details: R-07.23.
- R-07.8 Inbox: sections "New" (unreplied inbound), "Chats", "Parties & groups"; sort by last activity; star, mute, archive, delete (local + leave group).
- R-07.9 Chat header: avatar, name, verified, distance bucket, Now status; actions: video call (Later), profile, ⋯ (block, report, disappearing timer, share location, start check-in). 1:1 ⋯ opens the shared safety sheet S-21 (F-15 R-15.17, #111): View profile, Date check-in, Hide / Block / Report tiles, then chat settings. Inbox long-press on a 1:1 chat: same tiles + Star, Mute, Archive, Delete.
- R-07.10 Unsolicited explicit media from someone you haven't replied to → blurred per Settings (blur/allow/block).
- R-07.11 Franking: each message carries commitment; report sends plaintext + opening to moderation (F-15).
- R-07.12 Delivery: online → realtime `message.new`; offline → content-free push; server deletes ciphertext on ack from all devices or after 30 d.
- R-07.13 Multi-device: all devices in user's MLS leaf set; new device added only via F-01 R-01.6.
- R-07.14 Offline compose: queued, sent on reconnect; optimistic UI. Details: R-07.17–R-07.19.
- R-07.15 Taps: separate "Taps" row at top of inbox; tap back = mutual → suggests "Say hi".

## Delivery, integrity and bad networks
- R-07.16 Sender states, shown under own messages: **Sending** (in outbox) → **Sent** (server stored it for every recipient device) → **Delivered** (≥ 1 recipient device decrypted it; E2EE `delivered` payload `{t: 'delivered', upTo}`) → **Read** (`read` payload). **Not sent · Retry** only when the outbox gives up (R-07.17) or the server returns the recipient as `undelivered`. Delivered/Read follow R-07.23; with receipts off the sender stops at Sent.
- R-07.17 Outbox: every outgoing payload (text, media, reaction, read/delivered receipt, disappearing, album, profile.private) is written to an encrypted on-device `outbox` **before** any network call, so it survives app kill, reboot and sign-in refresh. Drained FIFO per conversation (one chat never blocks another). Retry with exponential backoff 1 s, 2 s, 4 s … capped at 60 s, ± 20 % jitter; socket (re)connect, app launch, app foreground and push mean the network is back, so they drain at once without waiting out the backoff. A new message waits behind older unsent ones in the same chat (order kept). After 24 h of failures the item becomes **Not sent · Retry** (receipts are dropped silently instead). Errors that can't succeed on retry (`not_verified`, `forbidden`, `validation`, `safe_mode_blocked`) fail at once with their message.
- R-07.18 Idempotent send: each item has a `client_id` (the payload `id`, 96 random bits). The item is MLS-sealed once; retries resend the **same** ciphertext and `client_id`, never re-encrypt. Server keeps `(sender device, client_id) → result` for 7 d and answers a repeat with the first result, storing and pushing nothing again. Result: no duplicates even when the response was lost. Recipients additionally dedup by payload `id`.
- R-07.19 Timeouts and network state: send request timeout 15 s, other chat calls 10 s; a timeout counts as "unknown" and is retried (safe under R-07.18). Network state = the realtime connection to our server (what matters for delivery; no extra native module): down for ≥ 3 s → chat header chip "Waiting for network", composer stays usable, Sending items stay Sending (no red error for being offline).
- R-07.20 Receive integrity: messages are processed in server order (`id`) per device; a batch is acked only after its results are committed to the local store in one transaction, so a kill mid-batch re-delivers instead of losing. A message that can't be decrypted is **not** dropped: it is kept (up to 24 h, re-tried after each new welcome/commit, since it may have arrived before them), then shown as a "Message couldn't be decrypted" row. In a 1:1 chat the device then re-syncs: it forgets the broken group, starts a new one (welcome to every peer device) and sends `{t: 'resync', drop: <old group id>}` in it, so the peer forgets the old group too. Server message ids already handled are remembered (last 2,000), so a re-delivery after a kill is acked without being processed twice. MLS state keeps the previous 3 epochs so late messages after a commit still decrypt. In the thread, messages sort by sender time clamped to [server time − 5 min, server time] (stops a wrong phone clock reordering the chat), then by arrival.
- R-07.21 Local store: one encrypted row per message (no per-chat JSON blob, no 500-message cap). Only the disappearing timer (R-07.6), view-once, "Delete for me" and chat delete remove messages. All writes to one conversation are serialized, so a send and a receive at the same moment can't overwrite each other.
- R-07.22 Server write is atomic: all envelopes of one `POST /mls/messages` are stored, or none (validation / limits fail the whole call). Undelivered ciphertext stays queued 30 d (R-07.12); a device offline longer gets a "Some messages expired while you were away" row per affected chat (count only, from the server's swept-count per device).
- R-07.23 Read receipts (Settings › Privacy › Read receipts, default on; covers Delivered, Read and typing): off → the device sends no `delivered`/`read`/typing **and** ignores incoming ones (enforced on the client for receipts, on the server for typing). Per-chat override in chat ⋯ › "Read receipts in this chat: Default / Off" (Off is symmetrical in that chat too). Receipts travel only inside MLS (server never learns who read what); in group chats Read shows a count, never names.
- R-07.24 Timing: online recipient p95 < 500 ms send → Delivered intra-EU (AC-07.2). Offline recipient: content-free push at once (throttle 1 per account per 20 s, F-16); messages wait server-side until a device pulls. Server measures insert → ack latency per message as an aggregate histogram only (no ids, no pairs).

## Translation (#106, on device only)
Goal: two people with no shared language can still chat. Privacy first: translation never breaks E2EE.
- R-07.25 Where: incoming `text` messages (and custom quick replies, group chats included) are translated **on the reader's phone**: iOS 18+ Apple Translation framework (`TranslationSession`) with NaturalLanguage `NLLanguageRecognizer` for detection; Android Google ML Kit Translation + Language ID (on-device models; follow-up #107, no Android build yet). Plaintext never goes to Thirstr or any translation service. Only language packs are downloaded, from Apple or Google, and they carry no message content. No cloud fallback in beta (D-16).
- R-07.26 Target language = the phone's first preferred language (`getLocales()[0].languageCode`, can differ from the app's en/fr/de). Source = detected per message: at least 8 letters, confidence ≥ 0.6, otherwise not translated (short words like "ok", emoji-only, links). Same language as target → nothing shown. Own messages are never translated: the sender always sends what they typed (no `lang` field on the wire, nothing new in the payload).
- R-07.27 Setting (device-only, Settings › Chats & media › Translation): **Translate messages** Automatic (default) / Tap / Off. Automatic: translated as the bubble appears when the language pack is on the phone. Tap: a "Translate" chip under the bubble. Off: nothing. Per-chat switch in chat ⋯ "Translate this chat" (on by default; off = nothing in that chat, stored on the device in `Conv.translate`; hidden when the device can't translate or the global setting is Off).
- R-07.28 Bubble: shows the translation; caption under it "Translated from ‹language› · Show original" (translate icon in teal). Show original expands the bubble: translation, hairline, original in secondary colour, caption "‹language› · Hide original". Copy / long-press use what is shown. At the top of a chat with a translated message, a teal note under the E2EE pill: "‹Source› is translated to ‹target› on this phone. Nothing leaves it."
- R-07.29 Language pack missing (iOS status `supported`, not `installed`): even in Automatic, nothing is downloaded silently; the bubble shows the original plus chip "Translate ‹language›" and caption "One-time download of the language pack. Your messages stay on this phone." Tapping it shows the system download sheet, then translates. Unsupported pair, device below iOS 18, web, or error → original only, no chip.
- R-07.30 Storage: translations are cached in the encrypted device store (`tr:<conv>␁<message id>` = `{from, to, text}`), deleted with the message (disappearing timer, delete for me, delete chat, R-07.21). Never synced, never in exports to other people, never in reports: a report sends the original plaintext only (R-07.11).
- R-07.31 Quick replies: the 6 built-in quick replies (R-07.5) carry their index `k` in the E2EE payload (`{t: 'quick_reply', text, k}`); the reader shows the built-in text in their own app language. `text` stays as the fallback for older apps. Custom quick replies are translated like text.

## Edge cases
- Recipient blocks sender mid-chat → sender sees "Message not delivered" without revealing block (generic).
- Recipient deleted account → chat archived "This profile is gone".
- Key package exhausted → client uploads 100 on each launch; fallback last-resort package.

## Acceptance criteria
- AC-07.1 Server DB/logs contain no plaintext message content in any env.
- AC-07.2 p95 delivery online < 500 ms intra-EU.
- AC-07.3 First message containing URL from new contact is blocked client-side and rejected (flag) server-side by franking-based heuristics on report only (no server scanning).
- AC-07.4 Disappearing timer deletes on both devices within 1 min of expiry.
- AC-07.5 Airplane mode: write 5 messages, kill the app, relaunch, restore network → all 5 arrive exactly once, in order, without user action.
- AC-07.6 Proxy drops the response to `POST /mls/messages` → client retries; recipient shows exactly one copy.
- AC-07.7 Recipient app killed mid-batch → after relaunch no message missing, none duplicated.
- AC-07.8 Receipts off (global or per chat) → no `delivered`/`read`/typing sent; incoming ones not shown.
- AC-07.9 A chat with 2,000 messages keeps all 2,000 (until timer/user delete).
- AC-07.10 Message arriving before its welcome/commit decrypts once they arrive; never silently disappears.
- AC-07.11 German phone receives "Are you still around tonight?" with the English pack installed → bubble shows the German translation and "Translated from English · Show original"; a network capture shows no request carrying the text.
- AC-07.12 Translate messages Off (global) or chat switch off → no translation, no chip. Tap → chip only. Pack missing → chip with download note, no silent download.
- AC-07.13 Quick reply "Yes 🔥" sent from an English app shows "Ja 🔥" on a German app.
- AC-07.14 Deleting a message (any way) deletes its cached translation.
