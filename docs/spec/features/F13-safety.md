# F-13 Safety: meet check-in, trusted contacts, panic, app lock

## Trusted contacts
- R-13.1 1–3 contacts. Add from Thirstr chats (in-app) or invite link via OS share sheet (SMS/WhatsApp/etc.). Contacts don't need the app: they get a web page (E2EE via key in URL fragment, never sent to server).
- R-13.2 Contact accepts once (proves channel + consent). Contact list stored **device-only**; server holds opaque relay tokens.
- R-13.3 Remove contact anytime; contact can opt out.

## Meet check-in
- R-13.4 Start from chat ⋯ or party accept: choose due time (presets +1 h, +2 h, +3 h, custom), optional "include his profile + chat if alert fires" (default on), optional live location (off by default).
- R-13.5 On start: contacts get E2EE notice "Alex has a meetup, check-in due 23:30" (no other details).
- R-13.6 At due time: local notification "All good?" → tap "I'm OK" (biometrics/PIN) or "Need 30 more min" (max 3 extensions).
- R-13.7 No answer +15 min → alert to contacts: last known location (captured at that moment), time, and if allowed the other person's profile snapshot + last 20 messages, all E2EE. Server only relays ciphertext via relay tokens.
- R-13.8 Panic: hold power button 3 s (where OS allows) or in-app SOS (long-press) → immediate alert + optional call to local emergency number (user confirms).
- R-13.9 Duress PIN at check-in → UI shows "All good" while alert is sent silently.
- R-13.10 All check-in data deleted on OK; alerts deleted from relay after delivery ack or 24 h.

## App lock
- R-13.11 App lock: biometrics or 6-digit PIN; on launch and after N minutes in background (1/5/15). Default on in Safe Mode.
- R-13.12 Duress PIN (optional): opens decoy (empty profile, no chats); real data untouched.
- R-13.13 Panic wipe: gesture (shake + hold) or duress PIN variant → wipe local DB + keys; account remains (recover via passkey; chats lost unless backup).

## Acceptance criteria
- AC-13.1 Server cannot read check-in contents (ciphertext only in relay).
- AC-13.2 Alert fires within 60 s after due + 15 min with app killed (server-side timer triggers push to contact relay).
- AC-13.3 Duress PIN path indistinguishable on screen from normal OK.

## Beta implementation (B4c)
**Relay.** One relay per trusted contact: `safety_relays` row (owner account, `sha256(rid)`, accepted_at, Web Push subscription). `rid` (18 random bytes, b64url) and the contact key `K` (AES-256-GCM, 32 bytes) live only in the owner's device store and in the invite link fragment `https://<site>/c/#<rid>.<K>`; the fragment is never sent to the server (AC-13.1). Mailbox `safety_msgs` holds ciphertext only.

**Envelope.** `AES-GCM(K, iv 12 B, JSON)`; wire = b64(iv ‖ ct). JSON `{k: invite|notice|alert|panic|ok|loc, from, at, due?, loc?: {lat, lng, acc, at}, who?: {name, age?, link?}, msgs?: [{me: bool, text, at}] ≤ 20}`. ≤ 64 KB per message.

**Invite (S-53).** Me › Safety › Add contact: label (device-only) → `POST /trusted/invite {intro}` (intro = envelope `k: invite`) → app builds the link and opens the OS share sheet (or copies). Max 3 accepted + 2 pending relays per account. Status via `GET /trusted`; remove = `DELETE /trusted/{id}` (relay + mailbox deleted).

**Contact page `/c/`** (site, no account, en/fr/de by browser language): decrypts the intro → "‹name› wants you as a trusted contact" → **Accept** (asks notification permission; registers a Web Push subscription when the browser allows; on iPhone it explains Add to Home Screen) or **No thanks** (= opt out, relay deleted, R-13.3). After accepting: lists decrypted messages newest first (alert/panic in red with map link `https://www.openstreetmap.org/?mlat=..&mlon=..`), acks them, polls every 30 s while open, **Stop being a contact** button. Service worker shows a generic notification ("Thirstr: a contact needs you. Open to see.") on an empty push.

**Web Push.** Empty-payload push (no content leaves the relay unencrypted) with VAPID (ES256 key `vapid` in `server_keys`, JWT `aud` = endpoint origin, 12 h). Endpoints only on the push-service allowlist (`fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`); 404/410 drops the subscription.

**Check-in (S-51).** Entry: chat ⋯ "Meet check-in" (includes that chat), Me › Safety › Start check-in (no chat). Presets +1/+2/+3 h, custom 15 min–12 h. Options: include profile + last 20 messages (default on when started from a chat), live location (off). Needs ≥ 1 accepted contact, else S-53 first. App sends `POST /checkin {due_at, notices[], alerts[]}` (one envelope per accepted relay each); notices are delivered now (R-13.5), alerts are held until `due_at + 15 min`.
- A local notification is scheduled at `due_at` (works with the app killed) and the server also pushes `checkin.due` (R-13.6).
- While the app runs, alerts are re-encrypted with a fresh location every 5 min (`PUT /checkin/{token}/alerts`); live location also sends a `loc` envelope then. Beta limit: with the app killed, the alert carries the location of the last refresh (documented in the sheet).
- Minutely sweep: due → `checkin.due` push once; `due + 15 min` → alerts released + Web Push to contacts (AC-13.2).

**Due (S-52).** "All good?" → **I'm OK** (app-lock PIN or biometrics; with no app lock, a confirm tap), **+30 min** (max 3; new alerts), **SOS**. OK → `POST /checkin/{token}/ok {oks[]}` deletes the check-in and its held alerts; optional `ok` envelopes tell contacts. Duress PIN at the PIN pad → screen shows the normal "All good" (AC-13.3) while the app calls `/checkin/{token}/panic` with panic envelopes.

**Panic (R-13.8).** Me › Safety SOS and the active check-in card: press and hold 2 s → `POST /checkin/panic {alerts[]}` (immediate, with current location) → confirm sheet "Call ‹112/911/999›?" (`tel:`; region from device locale, default 112). Power-button trigger is not available to iOS apps (beta: in-app only).

**App lock (S-55).** Me › Settings › App lock: 6-digit PIN (SHA-256 of per-device salt ‖ PIN, Keychain), Face ID / Touch ID, lock after 0/1/5/15 min in background; on launch always. Wrong PIN: 5 tries, then 30 s × 2ⁿ wait. Optional duress PIN (≠ PIN) with action **Decoy** (empty Explore and Chats; real data untouched, R-13.12) or **Wipe** (R-13.13). Turning on Safe Mode prompts to set up app lock (R-13.11).

**Panic wipe (R-13.13).** Shake the phone, then hold the red button 3 s within 5 s (on when app lock is set) → wipes device store, MLS state, keys and the session on this device; the account remains (sign in with passkey).
