# API & realtime contract

Base: `https://api.thirstr.fun/v1` (staging: `https://staging.thirstr.fun/v1`; DEV: `https://localhost:7443/v1`). JSON. Auth: short-lived access token (15 min) + refresh (30 d, device-bound) issued after passkey/OIDC/magic-link. Every request signed with device key + attestation token (iOS App Attest / Play Integrity) refreshed daily.

Errors: `{ "error": { "code": "rate_limited", "message": "...", "retry_after": 30 } }`. Codes: `unauthorized`, `forbidden`, `not_verified`, `rate_limited`, `not_found`, `conflict`, `validation`, `safe_mode_blocked`, `quarantined` (never returned to the quarantined client; it gets fake success).

## REST

### Auth (F-01)
| Method | Path | Body → Response |
|---|---|---|
| POST | /auth/passkey/register/options | {} → WebAuthn creation options |
| POST | /auth/passkey/register | attestation → {account_id, tokens} |
| POST | /auth/passkey/login/options | {} → request options |
| POST | /auth/passkey/login | assertion → tokens |
| POST | /auth/oidc | {provider: apple\|google, id_token} → tokens |
| POST | /auth/email/link | {email} → 202 (always) |
| POST | /auth/email/verify | {token} → tokens |
| POST | /auth/refresh | {refresh} → tokens (rotated; re-use of a spent token revokes the device) |
| POST | /auth/logout · /auth/logout_all | → 204 (this device · every device, R-01.5) |
| POST | /auth/device/link/start | → {qr_payload, expires} (old device) |
| POST | /auth/device/link/complete | {qr_payload, new_device_pubkey} → tokens |
| DELETE | /account | {confirm: "DELETE"} → 202; rows deleted immediately, objects purged by job ≤ 24 h |
| POST | /account/pause · /account/resume | |
| GET | /account/export | → 202; E2EE archive link pushed when ready |

Sign-up calls (passkey register, OIDC, email verify) carry `age_confirmed: true` (R-01.12) and `platform`. Every request carries `x-thirstr-install` (random per install, hashed server-side) used only for the R-02.3 under-age flag. Session response: `{access_token, refresh_token, expires_in, account: Me}`.

Outside `/v1`: `GET /.well-known/apple-app-site-association` → `{webcredentials: {apps: ["<TeamID>.app.thirstr"]}}` so iOS accepts this host as passkey relying party (I-03); 404 until `APPLE_TEAM_ID` is set. Native Apple sign-in sends Apple's identity token with `aud` = bundle id (`APPLE_CLIENT_IDS`, default `app.thirstr`).

### Account & onboarding (F-01, F-02)
| Method | Path | Body → Response |
|---|---|---|
| GET | /me | → Me `{status, verified, onboarding_step, safe_mode, profile, location}` (no ids of the account, no birthdate) |
| POST | /account/pause · /account/resume | → Me |
| PUT | /me/basics | {display_name, birthdate, gender, gender_other?, here_for[]} → Me; under 18 → 403 `underage`, account deleted, install flagged 30 d |
| POST | /me/onboarding/verify_later | → Me (step `verify` → `done`, browse-only) |
| GET | /welcome | → {city, center, count, cells:[{cell r7, count}]} (no auth, approximate IP city, R-02.2) |
| GET | /cities?q= | → {cities:[{id, name, country, cell_r5}]} (S-04b picker) |
| POST | /me/profiles/{id}/photos/{photo_id}/check | → {photo:{id, slot, status, reject_reason, url}, account: Me} (inline classifier result, R-02.7) |

`PUT /me/location` (F-05) accepts `{level: area|exact, cell_r9}` or `{level: city, city_id | cell_r5}`; `hidden` requires verification. Onboarding step order: `basics → location → photo → verify → done`.

### Verification (F-03)
| POST | /verification/challenge | → {nonce, challenge_seq} |
| POST | /verification/attest | {nonce, liveness_result_signed, photo_match_score, blinded_token} → {signed_blinded_token} |
| POST | /verification/redeem | {unblinded_token} → 204 (marks account verified) |

### Profiles (F-06)
| GET | /profile-options | {options:{field:[values]}, defaults:{field:{visibility, kinds}}, health:[…]} (field catalogue) |
| GET | /me/profiles | {profiles:[MyProfile]} |
| POST | /me/profiles | {kind: sport\|friends} → 201 MyProfile; 409 if it exists (Now profile is created at onboarding) |
| PATCH | /me/profiles/{id} | {display_name?, fields?, visibility_map?} → MyProfile. Values whose visibility is `chats`/`only_me` are dropped (kept on device, R-06.6); health fields can't be `public`; bio/text checked for contact details and links (R-06.10) |
| DELETE | /me/profiles/{id} | 204; the Now profile can't be deleted |
| POST | /me/profiles/{id}/photos | {slot, content_type} → {photo_id, put_url} |
| POST | /me/profiles/{id}/photos/{photo_id}/check | inline classifier → {photo, account} (status ok_main / ok_public / pending / rejected) |
| DELETE | /me/profiles/{id}/photos/{photo_id} | 204; main photo can't be removed |
| PUT | /me/profiles/{id}/photos/order | {order:[photo_id]} → MyProfile; first must have `main_ok` |
| GET | /profiles/{id} | ProfileView, viewer-filtered (stranger: public; verified: public+verified). 404 when blocked/unavailable. 300 views/h |
| POST | /profiles/{id}/tap | verified only; 100/day (50 for accounts < 7 days) → {mutual} |
| POST | /profiles/{id}/block | account-level, silent |
| POST · DELETE | /profiles/{id}/hide | hide from Explore |
| GET | /me/blocks | {blocks:[{profile_id, display_name, at}]} · DELETE /me/blocks/{profile_id} |
| GET | /taps | {taps:[{profile, at, seen, mutual, kind}]} (7 days) · POST /taps/seen |
| POST | /profiles/{id}/report | {reason, franked_payload?} (B4) |

### Location (F-05)
| PUT | /me/location | {level, cell_r9? \| cell_r5? \| city_id?, safe_mode_override?} (client computes cells; never lat/lng). Account-wide: all profiles move together |
| PUT | /me/pin | {lat, lng, ttl_s: 1800\|3600\|7200\|14400, audience: verified\|chats\|everyone, confirm: true, safe_mode_override?} → Me. RAM only, jittered 10–20 m. Verified only; Safe Mode needs override |
| DELETE | /me/pin | → Me |
| PATCH | /me/visibility | {incognito?, hide_from_hidden?} → Me (incognito verified-only) |

### Explore (F-04)
Common query: `mode=hookup|friends|sport`, `age_min`, `age_max`, `distance_max` (m), `verified_only` (default true), `online_now`, `has_now`, `hide_creators` (default true), `new_members`, and comma lists for `position, hosting, tribes, build, looking_for, languages, sports, sport_level, schedule, sport_intent, orientation` (position/hosting apply only for verified viewers and only to values visible to them).

| GET | /explore/grid | &cursor → {items:[Card], next, further_from, reason}. 60/page; sparse areas widen to 100 km with a "Further away" index |
| GET | /explore/map | &bbox=w,s,e,n → {cells:[{cell, res, count}], pins:[Card], avatars:[Card]}. Unverified and Safe Mode viewers get counts only (r7 / r5) |
| GET | /explore/tray | → {items:[Card]} up to 20 active (pin, Now, online) |

Card: `{id, display_name, age, verified, photo, online, distance, now, exact, pin_expires_at, further, creator, intent, position, new, lat?, lng?}`; `distance` is `{kind: exact, m}` (pin and owner allows exact), `{kind: area, bucket}` (lt200 … 10k_plus; ≥ 1 km for unverified viewers) or `{kind: city, city}`.

### Settings & Safe Mode (F-17, F-14)
| GET · PATCH | /me/settings | server-enforced settings (hide_from_*, show_in_*, show_distance, online_visible, read_receipts, who_can_message, explicit_from_strangers, disappearing_default, push, quiet_hours) |
| PUT | /me/safe_mode | {setting: auto\|on\|off, active: bool} → Me (country detection stays on device) |

### Map tiles
| GET | /tiles/style.json · /tiles/v/{z}/{x}/{y} · /tiles/fonts/{stack}/{range} | public; Pop dark style, tiles and glyphs proxied from `TILES_UPSTREAM` (OpenFreeMap) so clients never contact a third party |

### Tonight & Now (F-09)
| PUT/DELETE | /me/now | {status: now\|hosting\|can_travel\|door_open, text ≤ 80 (no links/contacts), ttl_s: 1–6 h} (verified only) |
| GET | /tonight?mode&from&to | → {plans: [{id, profile: card, text, tag, audience, window_start, window_end, distance}], mine: [plan]}; area = k-ring 2 around caller's r8 (10 km), widened to 25 km when < 5 plans; `chats` audience only for chat partners |
| POST | /tonight | {mode, text ≤ 140, tag: hosting\|can_travel\|drinks_first\|party\|other, audience: verified\|chats, window_start, window_end, tz_offset_min} (verified; ≤ 2 live per profile; expires 06:00 local) |
| DELETE | /tonight/{id} | own plan |

### Parties (F-10)
| GET | /parties | → {parties: [party]} nearby, live, not hidden (hookup profile) |
| POST | /parties | {title, starts_at, ends_at, capacity 2–50, rules[], audience: verified\|chats\|invite} (verified, not Safe Mode, 1 live party, 3 created/day) → party (+ `invite_code` for audience invite) |
| GET | /parties/{id}?code= | party; host view adds `requests: [{profile, state, at, vouches}]` and `invite_code` |
| PATCH | /parties/{id} | host: {status: open\|full\|ended\|cancelled, cohost_profile_id?} |
| POST | /parties/{id}/request | {code?} (verified) → party (`my_state: pending`) |
| POST | /parties/{id}/requests/{profile_id}/accept\|decline\|remove | host or co-host; accept is transactional and sets `full` at capacity |
| POST | /parties/{id}/leave · /rate {up} · /report {reason} | rate: accepted guests after end; 2 reports → hidden pending review |
Party: `{id, title, host: card, starts_at, ends_at, capacity, seats_taken, rules, audience, status, distance, my_state: host\|pending\|accepted\|declined\|left\|null, rating?}`. Socket topic `party:{id}` → `seats` updates. Address and door code are never sent to the server: the host sends them E2EE in the guest group chat.

### Activities & clubs (F-11) — Sport profile
| GET | /activities?sports= | → {posts: [post]} nearby, not expired |
| POST | /activities | {sport, title, place_text?, venue_id?, starts_at, capacity?, intent, club_id?} (verified, Sport profile else 409 `sport_profile_required`, ≤ 3 live; expires start + 3 h) |
| DELETE | /activities/{id} | host |
| POST | /activities/{id}/rsvp | {going: bool} (capacity checked in a transaction) |
| GET | /activities/{id}/members · DELETE /activities/{id}/members/{profile_id} | host and going members only · host removes |
| GET/POST | /clubs | list nearby (r5) / create {name, description, sport, join_policy: open\|approval} (verified, account ≥ 30 days) |
| GET | /clubs/{id} | club + `events`; members see `member_list` |
| POST | /clubs/{id}/join · /leave · /members/{profile_id}/approve\|remove\|promote | admin actions for admins |

### Venues (F-12)
| GET | /venues/nearby?mode | → {venues: [{id, name, kind, here: "0"\|"a_few"\|n, distance}]}; kinds by mode (gym only in Sport) |
| POST | /venues/{id}/checkin?mode | {visible, zone? ≤ 40} (verified, not Safe Mode, ≤ 1.5 km from the venue cell) → here; one check-in per account, auto check-out after 4 h |
| PATCH | /venues/{id}/checkin | {visible?, zone?} |
| POST | /venues/checkout | |
| GET | /venues/{id}/here | 403 unless checked in here; invisible callers see nobody. → {venue, me, stats: {total, visible_to_you, tapped_you}, people: [{profile, zone, since, tapped_me}]} |

### Group chats (parties, activities, clubs)
MLS groups like 1:1 chats. `context` = `party:{id}` \| `activity:{id}` \| `club:{id}` on `/mls/keypackages/claim` and `/mls/messages` lets members of the same party, activity or club reach each other without first-contact rules and without counting as new contacts. The host (party host, activity host, first club admin) adds and removes members with MLS commits when the member list changes. Welcome wire: `sha256(kp) ‖ '{"ctx":"…"}\n' ‖ Welcome`. Sender name and group title travel inside the E2EE payload.

### Messaging (F-07, F-08) — MLS Delivery Service
One MLS identity per (own profile, device): credential identity = `{"p": profile_id, "d": device_id}`. The server routes by (profile, device) and stores ciphertext only (AC-07.1).

| Method | Path | Body → response |
|---|---|---|
| GET | /mls/keypackages | → {counts: {profile_id: {count, last_resort}}, device_id} for this device |
| POST | /mls/keypackages | {profile_id, key_packages: [b64] (≤ 200 stored per device), last_resort?: b64 (replaces previous)} → {counts, device_id} |
| POST | /mls/keypackages/claim | {from_profile_id, to_profile_id, context?} → {key_packages: [{id, device_id, key_package}]}, one per recipient device, single-use (last-resort reused). First contact needs caller verified unless replying (R-07.2); recipient without packages → 409 `unavailable` |
| POST | /mls/messages | {from_profile_id, group_id: b64, franking_tag?: b64, context?, envelopes: [{to_profile_id, to_device_id, kind: welcome\|commit\|app, key_package_id?, ciphertext: b64 ≤ 256 KB}] ≤ 200} → {delivered: [profile_id], undelivered: [profile_id]}. Blocked recipients land in `undelivered` (generic "Not delivered", no block reveal). New-contact limit 30/h. Emits `message.new` (no content) + push |
| GET | /mls/messages?after= | → {messages: [{id, to_profile_id, from_profile_id, group_id, kind, key_package_id, ciphertext, at}]} for this device, ≤ 200 |
| POST | /mls/messages/ack | {ids} → deletes them (R-07.12); unacked swept after 30 d |
| POST | /media/upload | {size ≤ 210 MB, ttl_s?, album?: bool} → 201 {blob_id, put_url}; ciphertext only (AES-256-GCM on device). Chat media ≤ 30 d; album items until deleted |
| GET | /media/{blob_id} | → {url} signed GET (1 h) |
| DELETE | /media/{blob_id} | owner only; album revoke and item delete |
| PUT | /me/push | {token, platform: ios\|android} → 204 (device push token) |

Welcome wire (client convention): `sha256(recipient key package) ‖ MLS Welcome`, so the receiver finds its private key package without trial decryption. Plaintext inside MLS app messages is JSON `{v: 1, id, at, fk, t, …}` with `t` from R-07.4 plus `read`, `disappearing`, `screenshot`. `fk` is the franking key; `franking_tag = HMAC-SHA256(fk, plaintext)` goes to the server (R-07.11).

### Safety (F-13)
| POST | /checkin | {due_at, contact_relay_tokens[]} → {checkin_token} |
| POST | /checkin/{token}/ok | |
| POST | /checkin/{token}/panic | |
| POST | /trusted/invite | → {invite_link} (contact accepts via web page; relay token) |

### Social (I-01, I-02, F-18)
| POST | /me/linked-accounts | {platform, handle} → {proof_method, code?} |
| POST | /me/linked-accounts/{id}/verify | |
| POST | /profiles/{id}/vouch | |

## Realtime (Phoenix Channels, WSS)
Connect: `wss://<api host>/socket/websocket?token=<access token>&vsn=2.0.0`, then join `user:me` (beta: one private topic per account; the server maps it).

| Topic | Events (server → client) | Client → server |
|---|---|---|
| `user:{account_token}` | `message.new` (ciphertext), `tap.new`, `party.request`, `party.accepted`, `photo.status`, `verification.done`, `checkin.due`, `moderation.notice` | `typing`, `read` (if enabled) |
| `cell:{cell_r7}` | `presence.diff` (counts per r9/r8), `pin.add/remove`, `now.add/remove` | — (join/leave by viewport) |
| `party:{id}` | `seat.update`, `status` | — |
| `venue:{id}` | `here.diff` (checked-in, visible) | — |

Rate limits (beta defaults, per account): messages to new contacts 30/h (unverified: 0), taps 100/day, location updates 1/30 s, pin set 6/h, party create 3/day, report 20/day.

## Push payloads
Beta (no notification service extension yet): a **visible, generic** alert, identical for every event type:
`{ "aps": { "alert": { "title": "Thirstr", "body": "New activity" }, "sound": "default", "mutable-content": 1 }, "t": "<opaque>" }`.
Safe Mode: title "Reminder", body "You have a reminder". Never names, text, images or event type. iOS does not reliably deliver silent `content-available` pushes to a closed app, so a pure silent wake would lose messages. The app fetches and renders the rest when opened. Preview levels Name only / Full (R-16.3) arrive with the notification service extension (`mutable-content` is already set). Throttle: 1 push per account per 20 s; type toggles and quiet hours applied server-side.
