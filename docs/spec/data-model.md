# Data model (server-side)

Principle: store the minimum; anything audience-restricted is E2EE or coarse-flagged. Server-visible = **SV**, ciphertext only = **CT**, RAM-only = **RAM**, device-only = **DEV**.

## Postgres

### accounts
| Column | Type | Notes |
|---|---|---|
| id | uuid | internal; never shown |
| created_at | timestamptz | |
| auth_passkey_ids | bytea[] | WebAuthn credential IDs |
| auth_oidc_hash | bytea null | SHA-256(provider‖sub‖pepper) for Apple/Google |
| email_hash | bytea null | magic link / recovery only |
| verified_at | timestamptz null | set by F-03 |
| verification_epoch | int | bumps on re-verify |
| status | enum(active, paused, quarantined, banned, deleted) | |
| safe_mode | enum(auto, on, off) | |
| settings | jsonb | non-sensitive settings (F-17) |
| plus_until | timestamptz null | Later |
| birthdate | date | R-02.3 age gate + profile age; never returned by the API |
| age_confirmed_at | timestamptz | R-01.12 checkbox |
| onboarding_step | enum(basics, location, photo, verify, done) | F-02 resume |
| paused_at | timestamptz null | R-01.9 |
| incognito | bool | R-05.5 browse without appearing (verified only) |
| hidden | bool | location level Hidden (no location_cells rows) |
| safe_mode_active | bool | effective Safe Mode reported by the device (F-14) |

### passkeys
| id · account_id · credential_id bytea (unique) · cose_key bytea (public key) · sign_count |

### refresh_tokens
| id · account_id · device_id · token_hash bytea (HMAC) · expires_at · used_at (rotation) |

### cities (public reference data for S-04b / Welcome)
| id · name · country · lat · lng · cell_r5 |

### devices
| id uuid · account_id · platform enum(ios, android, web) · attestation_ok bool · push_token_enc bytea (encrypted at rest) · mls_client_id bytea · last_seen_day date |

### profiles
| Column | Type | Notes |
|---|---|---|
| id | uuid | public handle id (random, unlinkable across profiles) |
| account_id | uuid | **never exposed in API** |
| kind | enum(now, sport, friends) | |
| display_name, age, gender (+ gender_other), here_for[], pronouns, orientation, languages[] | SV | Public fields (age stored as int, refreshed from birthdate) |
| bio, prompt_q, prompt_a | SV | |
| body (height_cm, weight_kg, build, hair, beard), tribes[] | SV | |
| looking_for[] | SV | |
| hookup_flags | int bitset | position, hosting, groups, practices (coarse flags for filtering) — served only to verified viewers |
| sport (sports[], level, schedule[], intent) | SV | |
| relationship | SV | |
| creator | bool | |
| visibility_map | jsonb | field → public/verified/chats/only_me |
| photo_ids | uuid[5] | ordered; [0] = main |
| completeness | smallint | |
| fields | jsonb (GIN) | catalogue values whose visibility is public/verified (`Thirstr.Profiles.Fields`); filters query it |
| public_updated_at | timestamptz | fuzzed ±1 h so edits can't be correlated across profiles |
| updated_at | timestamptz | |

B1 stores the SV fields in the `fields` jsonb rather than one column each; `hookup_flags` is not used (jsonb filters instead).

Audience-restricted values (health, socials, limits, boundaries card) are **not** stored here; they are sent E2EE to chat partners (F-06 R-06.6).

### photos
| id · profile_id · slot (0–4) · storage_key · status enum(pending, ok_main, ok_public, rejected) · reject_reason · review_state · classifier_score jsonb (`main_ok` flag) · created_at |

### location_cells (one row per visible profile, overwritten)
| profile_id pk · level enum(city, area, exact) · cell_r9 · cell_r8 · cell_r7 · cell_r5 (bigint = `h3index::bigint`; City stores r5 only) · updated_at · hide_from_hidden bool · display_res smallint (9/8/7/5: k-anonymity, widened each minute when < 5 people share the cell) |
Exact coordinates are **not** here (Valkey).

### now_status
| profile_id pk · status enum(now, hosting, can_travel, door_open) · text · created_at · expires_at |

### tonight_plans
| id · profile_id · window_start · window_end · text (140) · tag enum(hosting, can_travel, drinks_first, party, other) · audience enum(verified, chats) · cell_r8 · cell_r5 · expires_at (06:00 local, from tz_offset_min) |

### parties
| id · host_profile_id · cohost_profile_id null · title · starts_at · ends_at · capacity · rules[] · audience enum(verified, chats, invite) · invite_code null · cell_r8 · cell_r5 · status enum(open, full, live, ended, cancelled) · hidden bool (2 reports) |
### party_requests
| party_id · profile_id · state enum(pending, accepted, declined, left) · rating null (up/down after end) · created_at |
### party_reports (party_id, reporter_account, reason, created_at; unique pair)
Address/door code: E2EE message to accepted guests, never in DB.

### activity_posts
| id · profile_id · club_id null · sport · title · place_text · venue_id null · starts_at · capacity null · intent enum(just_sport, open_to_more) · cell_r8 · cell_r5 · expires_at (start + 3 h) |
### activity_rsvps (post_id, profile_id, state)

### clubs / club_members
| clubs: id · name · sport · cell_r5 · description · join_policy enum(open, approval) · verified_club bool · created_at |
| club_members: club_id · profile_id · role enum(member, admin) · state enum(requested, member) · joined_at (first admin = owner, runs the club chat) |

### venues / venue_checkins
| venues: id · name · kind enum(sauna, bar, club, gym, other) · cell_r9 · cell_r5 · geofence_radius_m · hours null · tz_offset_min · added_by enum(team, partner) |
| venue_checkins: venue_id · profile_id (PK) · visible bool · zone (40) null · checked_in_at · auto_out_at (4 h); row deleted at check-out |

### taps (from_profile_id, to_profile_id, seen, created_at; unique pair; swept after 7 d)
### profile_hides (account_id, profile_id) — hidden from the viewer's Explore
### contacts (profile_a, profile_b, a_sent, b_sent) — who has messaged whom (pin audience "my chats", who-can-message)
### blocks (account_from, account_to) — account-level: blocks all profiles both ways
### vouches (from_account, to_profile, created_at, weight) — capped, decays (F-18)
### reports (id, reporter_account, target_profile, reason, franked_payload CT null, state, created_at)
### moderation_actions (id, target_account, action, reason, actor, created_at, appeal_state)
### linked_accounts (profile_id, platform enum(x, bluesky, onlyfans, jff, instagram), handle, proof_method, verified_at, visibility)
### mls_key_packages (id bigserial, profile_id, device_id, key_package bytea, last_resort bool, created_at) — single-use; ≤ 200 per (profile, device); one last-resort per (profile, device)
### mls_messages (id bigserial, to_profile_id, to_device_id, from_profile_id, group_id bytea, kind welcome|commit|app, key_package_id, ciphertext bytea, created_at) — deleted on ack, swept after 30 d
### franking_tags (message_id, tag bytea, created_at) — R-07.11 commitments, swept with messages
### media_blobs (id uuid, account_id, storage_key, size, expires_at, created_at) — E2EE ciphertext only; owner can delete
### devices.push_token / push_platform — APNs/FCM token per device (content-free pushes)
### trusted_contacts — **not stored server-side** beyond relay tokens (F-13).

## Valkey (RAM-only, no persistence)
| Key | Value | TTL |
|---|---|---|
| `pin:{profile_id}` | lat, lng (jittered), audience, expires_at | user-chosen (30 min–4 h) |
| `ownpin:{account}` | pin info for Me | same |
| `vcell:{account}` | viewer cell for Explore (also when Hidden) | 24 h |
| `seen:{account}` | last request (online dot, 5 min) | 15 min |
| `hfh:{account}` | hide-from-hidden flag | 30 d |
| `sig:{signal}:{account}` | anti-bot signal counters (velocity, tap bursts) | window |
| `presence:{cell_r8}` | Phoenix Presence | live |
| `rl:{account}:{action}` | counters | window |
| `checkin:{token}` | due_at, contact relay tokens | until due + 15 min |
| `ip:{hash}` | abuse counters | 24 h |
| `pushq:{account}` | push throttle (1 per 20 s) | 20 s |

## Object storage
- `public/{photo_id}.avif` — public photos (plaintext, CDN, signed URL 1 h).
- `blob/{random}` — E2EE media (ciphertext), deleted on all-recipients-ack or 30 d.

## Device-only (SQLCipher)
Chats, private notes & tags, trusted contacts list, health reminders, received media, albums keys, MLS state, recovery phrase (never stored, shown once).

Beta store: one encrypted key-value table (`expo-sqlite` + SQLCipher, key in Keychain). Keys: `convs`, `msgs:{conv}`, `grp:{group}` (MLS state), `g2c:{group}`, `kp:{sha256}` (private key packages), `kp:lastresort:{profile}`, `albums`, `grant:{conv}:{album}`, `note:{profile}`, `quick:custom`. Wiped on sign-out and account delete.

## Retention
| Data | Retention |
|---|---|
| Undelivered ciphertext | 30 d |
| Location cell | overwritten; deleted on Hidden or 24 h inactivity |
| Exact pin | TTL |
| Tonight / Now / activity posts | expiry + 1 h |
| Reports | 1 y (legal), franked payload deleted after decision + 90 d |
| Deleted account | hard delete ≤ 24 h; backups roll off ≤ 30 d |
