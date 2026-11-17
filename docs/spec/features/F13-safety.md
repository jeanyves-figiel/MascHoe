# F-13 Safety: meet check-in, trusted contacts, panic, app lock

## Trusted contacts
- R-13.1 1–3 contacts. Add from MascHoe chats (in-app) or invite link via OS share sheet (SMS/WhatsApp/etc.). Contacts don't need the app: they get a web page (E2EE via key in URL fragment, never sent to server).
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
