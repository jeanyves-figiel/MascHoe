# F-18 Vouches & trust badges

## Badges (system-set)
| Badge | Rule |
|---|---|
| Verified | F-03 credential valid; shows month/year |
| Member since | account created month/year (shown as "2 yrs") |
| Vouches N | count of active vouches |
| Replies fast | reply rate bucket ≥ 60 % within 1 h over last 30 d |
| Host rating | ≥ 3 party ratings; shows 👍 % |

## Vouches
- R-18.1 Only verified accounts ≥ 30 d old can vouch; only for profiles they chatted with (≥ 10 messages both ways) — proxy for having met.
- R-18.2 Max 5 vouches given per 30 d; max counted vouches displayed 20.
- R-18.3 Vouches decay: weight 1.0 for 6 months, then linear to 0 at 12 months.
- R-18.4 Vouches between the same pair count once; reciprocal vouch rings detected (graph clustering) → discounted.
- R-18.5 Vouch is anonymous to the receiver (count only); can be withdrawn.
- R-18.6 Vouches never affect sorting in Explore (anti pay-to-win/popularity) — shown only on profile and party requests.

## Video check (#159, [mockup](https://claude.ai/artifact/KExcdnKfZCDiJLLPPMq8d2))
Goal: in a 1:1 chat, prove the other person is the one in the photos, live, now. Anti-catfish. Privacy first: the clip is end-to-end encrypted, watched once, then deleted everywhere.
- R-18.7 **Who**: only in 1:1 chats (not groups). Requester must be verified (F-03). Either side can ask once the chat has a message either way. Max 1 open request per chat (either direction), 3 requests per chat per 24 h (enforced on both devices; the recorder's device ignores extra requests silently). Blocked, hidden or reported pairs: no request; block or report cancels any open request and deletes its clip.
- R-18.8 **Request** (S-45 sheet): from chat ⋯ "Video check ‹name›" and the safety sheet S-21 context row. Sheet: title "Video check ‹name›", text "He records a few seconds live in Thirstr doing this move. You watch it once.", label **His move** + "⟳ Another", move card (emoji pair + text), switch **Send mine too** (off by default; on = the requester's phone opens the recorder right after sending, the same move applies both ways), teal CTA **Ask for video check**, teal note "Encrypted end to end. Nobody, us included, can see it." The move is drawn on the requester's phone from a fixed list of 24 two-step moves (hand sign + head/face action, en/fr/de, no explicit content), CSPRNG, never sent to the server in clear. Sent as E2EE payload `{t: 'vcheck', op: 'request', id, move: <index>, mutual: bool, exp}` (`id` 96 random bits, `exp` = now + 24 h).
- R-18.9 **Request card** (recorder side, in the chat): teal-bordered card "‹name› asks for a video check", move card, line "3 to 5 seconds. He can watch it once, then it's deleted everywhere.", sun line "Screenshots are blocked, but someone could still film the screen with another phone.", buttons **Record** (teal) / **Not now** (ghost). Not now sends `{op: 'decline', id}`; requester's card becomes "‹name› declined the video check" (may ask again after 1 h). Expired → "Video check request expired". Requester's own card: "You asked for a video check · Waiting" + **Cancel** (`op: 'cancel'`).
- R-18.10 **Recorder** (S-46, full screen, nav bar hidden): front camera in the app only (expo-camera), no camera roll or file input. Face oval guide, the move pinned at the top ("‹name› will check you did this"), tap the shutter to start: 3-2-1 then records, red REC timer, progress ring, stops at 5 s (stop allowed from 3 s). Audio off by default (🎤 chip turns it on for this clip). Then a still preview with **Retake** (max 3) / **Send**. Capture protection as R-18.13 on this screen too. Leaving the app while recording discards the clip.
- R-18.11 **Encode + send**: 720p (portrait 720×1280 max), H.264 High (HEVC where hardware encodes), ~2 Mbit/s, 30 fps, no metadata (no location, no device model; the app writes the file itself with AVAssetWriter / MediaMuxer, never through the photo library). Target ≤ 1.5 MB, hard cap 3 MB. Encrypted on the phone with a fresh AES-256-GCM key (same scheme as R-08.2). Uploaded with `POST /media/upload {size, once: true}`; payload `{t: 'vcheck', op: 'clip', id, blob, key, nonce, dur_ms, at}` travels in the 1:1 MLS group. The plaintext file is deleted from the recorder's phone right after encryption; the recorder never keeps a copy.
- R-18.12 **Server one-time blob**: `media_blobs.once = true`, TTL 24 h. `GET /media/{id}` on a once blob: first call binds it to the caller's account (`fetched_by`, `fetched_at`) and returns the ciphertext URL; repeat calls only from that account and only within 10 min (network retry), else 404. The client calls `DELETE /media/{id}` as soon as it has the bytes (allowed for the uploader or `fetched_by`); the sweep deletes once blobs 10 min after first fetch or at expiry, whichever comes first. The server never sees the key, the move or the result.
- R-18.13 **Capture protection** (recorder S-46 and viewer S-47): Android `FLAG_SECURE` on the window (screenshots and recordings show black). iOS: video drawn inside a capture-protected layer (the secure-text-field layer technique, local module `thirstr-secure-view`), so screenshots and recordings show black; while `UIScreen.isCaptured` / scene capture state is on (recording, AirPlay, mirroring) the video is not decoded at all and a black card says "Screen recording is on. Stop it to watch."; `userDidTakeScreenshotNotification` during the viewer sends `{op: 'screenshot', id}` → recorder's chat shows "📸 ‹name› took a screenshot during your video check". Web (DEV): video check not offered. A diagonal watermark of the viewer's display name + date/time is drawn over the video on the viewer's phone. The UI never claims more than this: filming with another phone can't be prevented and the request card says so.
- R-18.14 **Viewer** (S-47, full screen, **option A: hold to watch**, pending owner pick): requester's card "Video check from ‹name› · Ready" with **Watch once** (teal). Opens the viewer: top progress bar (5 s), move card "You asked: ‹move›", "‹name› · recorded HH:MM". Video blurred until a finger is down anywhere; lift = pause + blur; the clip's run time is spent only while held; total plays once. Option B (if picked): one tap ▶ Watch once, plays straight through, no pause. Leaving the app, locking the phone or capture starting ends viewing (counts as watched). The decrypted clip lives only in memory / an unlinked temp file deleted on close; never in the camera roll, backups or the media cache.
- R-18.15 **Face match** (on the requester's phone, same model as R-03.2): 3 frames of the clip vs the face in the peer's public photos (already on the phone from the profile). Result shown after viewing: "Face matches his photos" (teal) / "Couldn't match his photos" (sun, neutral wording) / nothing if no photo has a face. Never sent anywhere.
- R-18.16 **Confirm**: after the clip ends: "Did he do the move?" **Yes, it's him** / **No**. Yes → `{op: 'confirm', id, ok: true}`; both chats show the system line "◉ You video-checked ‹name› · date" / "‹name› video-checked you · date"; the requester's chat header shows the teal pill **Video-checked** under the name. No → no badge, nothing sent to the recorder except `{op: 'done', id}` (watched), and the sheet offers Report (F-15, reason "Fake profile / catfish"). The recorder always sees "Watched · deleted" on their card.
- R-18.17 **Badge**: per chat, device-only (`vcheck:<profile id>` = `{at, mutual}` in the encrypted store), never on the public profile, never on the server, never in Explore sorting. Valid 90 days, then shows "Video-checked · 3 mo ago" in grey and offers a new check. Kept per person when the chat is deleted (like notes, R-07.38); removed on block.
- R-18.18 **States** (`id` per request): `requested → declined | cancelled | expired | recorded → watched → confirmed | rejected`. Only `requested` and `recorded` can expire (24 h). A recorded clip that is never watched: blob swept at 24 h; card "Video check expired".
- R-18.19 **Data and battery**: one request ≈ 1 KB, one clip ≤ 3 MB (target 1.5 MB). Camera opens only on Record; encoding in hardware; no background work; no prefetch: the clip downloads only when the requester taps Watch once.
- R-18.20 **Safe Mode** (F-14): allowed (it's a safety feature); Safe Mode forces audio off.

## Acceptance criteria (video check)
- AC-18.3 Network capture of the whole flow shows no plaintext video, key or move; the server DB holds only the once blob row, gone ≤ 10 min after the first fetch.
- AC-18.4 Second `GET /media/{id}` from another account → 404; from the same account after 10 min → 404.
- AC-18.5 Android: screenshot and screen recording of S-46/S-47 are black. iOS: screen recording on → video not shown; screenshot → black frame (or, where the OS draws content, the recorder gets the screenshot line).
- AC-18.6 Closing the viewer, backgrounding or locking ends viewing; the clip can't be opened again (no file on disk, `vcheck` state = watched).
- AC-18.7 Decline shows "declined" on the requester side; a 4th request in 24 h is not shown to the recorder.
- AC-18.8 Yes → badge on both sides within one delivery; block removes the badge and cancels open requests without sending anything.

## Acceptance criteria
- AC-18.1 Account < 30 d gets 403 on vouch.
- AC-18.2 Explore ordering unchanged by vouch count (test).
