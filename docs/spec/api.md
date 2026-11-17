# API & realtime contract

Base: `https://api.<domain>/v1` (DEV: `https://localhost:7443/v1`). JSON. Auth: short-lived access token (15 min) + refresh (30 d, device-bound) issued after passkey/OIDC/magic-link. Every request signed with device key + attestation token (iOS App Attest / Play Integrity) refreshed daily.

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
| GET | /me/profiles | own profiles |
| POST | /me/profiles | create (max 3) |
| PATCH | /me/profiles/{id} | fields, visibility_map |
| DELETE | /me/profiles/{id} | |
| POST | /me/profiles/{id}/photos | upload URL → {photo_id, put_url}; after upload → classifier → status via realtime |
| PUT | /me/profiles/{id}/photos/order | [photo_id] |
| GET | /profiles/{id} | viewer-filtered profile (visibility rules applied server-side for SV fields) |
| POST | /profiles/{id}/tap | |
| POST | /profiles/{id}/block | account-level |
| POST | /profiles/{id}/report | {reason, franked_payload?} |

### Location (F-05)
| PUT | /me/location | {level, cell_r9?, cell_r5?} (client computes cells; never lat/lng unless exact) |
| PUT | /me/pin | {lat, lng, ttl_s, audience} → stored RAM-only with jitter |
| DELETE | /me/pin | |
| PATCH | /me/visibility | {incognito, hide_from_hidden} |

### Explore (F-04)
| GET | /explore/grid | ?mode=hookup&filters=…&cursor= → [{profile_card, distance_bucket, cell_r9?, pin?, now?}] |
| GET | /explore/map | ?mode&bbox_cells=[r7…] → {cells:[{cell, count, sample_cards}], pins:[…]} |
| GET | /explore/tray | ?mode → active-now cards |

### Tonight & Now (F-09)
| PUT/DELETE | /me/now | {status, text, ttl_s} |
| GET/POST | /tonight | list / create plan |
| DELETE | /tonight/{id} | |

### Parties (F-10)
| GET/POST | /parties | list nearby / create |
| GET/PATCH/DELETE | /parties/{id} | |
| POST | /parties/{id}/request | |
| POST | /parties/{id}/requests/{profile_id}/accept\|decline | host |
| POST | /parties/{id}/leave | |

### Activities & clubs (F-11)
| GET/POST | /activities · POST /activities/{id}/rsvp | |
| GET/POST | /clubs · POST /clubs/{id}/join · admin endpoints | |

### Venues (F-12)
| GET | /venues/nearby?cell_r8 | |
| POST | /venues/{id}/checkin {visible} · POST /venues/{id}/checkout | |
| GET | /venues/{id}/here | visible checked-in only, caller must be checked in |

### Messaging (F-07, F-08) — MLS Delivery Service
| POST | /mls/keypackages | upload key packages |
| GET | /mls/keypackages/{profile_id} | fetch one (consumed) |
| POST | /mls/messages | {group_id, ciphertext, recipients_tokens, franking_tag} |
| GET | /mls/messages?since= | fallback pull |
| POST | /media/upload | → {blob_id, put_url} ciphertext |
| GET | /media/{blob_id} | signed GET |

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
Connect: `wss://rt.<domain>/socket?token=…`.

| Topic | Events (server → client) | Client → server |
|---|---|---|
| `user:{account_token}` | `message.new` (ciphertext), `tap.new`, `party.request`, `party.accepted`, `photo.status`, `verification.done`, `checkin.due`, `moderation.notice` | `typing`, `read` (if enabled) |
| `cell:{cell_r7}` | `presence.diff` (counts per r9/r8), `pin.add/remove`, `now.add/remove` | — (join/leave by viewport) |
| `party:{id}` | `seat.update`, `status` | — |
| `venue:{id}` | `here.diff` (checked-in, visible) | — |

Rate limits (beta defaults, per account): messages to new contacts 30/h (unverified: 0), taps 100/day, location updates 1/30 s, pin set 6/h, party create 3/day, report 20/day.

## Push payloads
`{ "aps": { "content-available": 1 }, "t": "<opaque>" }` — app wakes, fetches, renders locally per notification settings (F-16). Never names, text or images.
