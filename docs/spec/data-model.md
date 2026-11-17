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

### devices
| id uuid · account_id · platform enum(ios, android) · attestation_ok bool · push_token_enc bytea (encrypted at rest) · mls_client_id bytea · last_seen_day date |

### profiles
| Column | Type | Notes |
|---|---|---|
| id | uuid | public handle id (random, unlinkable across profiles) |
| account_id | uuid | **never exposed in API** |
| kind | enum(now, sport, friends) | |
| display_name, age_bracket, gender, pronouns, orientation, languages[] | SV | Public fields |
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
| updated_at | timestamptz | |

Audience-restricted values (health, socials, limits, boundaries card) are **not** stored here; they are sent E2EE to chat partners (F-06 R-06.6).

### photos
| id · profile_id · slot (0–4) · storage_key · status enum(pending, ok_main, ok_public, rejected) · classifier_score jsonb · created_at |

### location_cells (one row per visible profile, overwritten)
| profile_id pk · level enum(city, area, exact) · cell_r9 h3 · cell_r8 h3 · cell_r7 h3 · cell_r5 h3 · updated_at · hide_from_hidden bool |
Exact coordinates are **not** here (Valkey).

### now_status
| profile_id pk · status enum(now, hosting, can_travel, door_open) · text · expires_at |

### tonight_plans
| id · profile_id · window_start · window_end · text (140) · tag enum(hosting, can_travel, drinks_first, party, other) · cell_r8 · expires_at (06:00 local) |

### parties
| id · host_profile_id · title · starts_at · ends_at · capacity · rules[] · audience enum(verified, chats, invite) · cell_r8 · status enum(open, full, live, ended, cancelled) |
### party_requests
| party_id · profile_id · state enum(pending, accepted, declined, left) · created_at |
Address/door code: E2EE message to accepted guests, never in DB.

### activity_posts
| id · profile_id · sport · title · place_text · venue_id null · starts_at · capacity null · intent enum(just_sport, open_to_more) · cell_r8 · expires_at |
### activity_rsvps (post_id, profile_id, state)

### clubs / club_members
| clubs: id · name · sport · city_cell_r5 · description · admin_profile_ids[] · verified_club bool |
| club_members: club_id · profile_id · role enum(member, admin) · state enum(requested, member) |

### venues / venue_checkins
| venues: id · name · kind enum(sauna, bar, club, gym, other) · cell_r9 · geofence_radius_m · added_by enum(team, partner) |
| venue_checkins: venue_id · profile_id · visible bool · checked_in_at · auto_out_at |

### taps (profile_from, profile_to, created_at, expires 7 d)
### blocks (account_from, account_to) — account-level: blocks all profiles both ways
### vouches (from_account, to_profile, created_at, weight) — capped, decays (F-18)
### reports (id, reporter_account, target_profile, reason, franked_payload CT null, state, created_at)
### moderation_actions (id, target_account, action, reason, actor, created_at, appeal_state)
### linked_accounts (profile_id, platform enum(x, bluesky, onlyfans, jff, instagram), handle, proof_method, verified_at, visibility)
### trusted_contacts — **not stored server-side** beyond relay tokens (F-13).

## Valkey (RAM-only, no persistence)
| Key | Value | TTL |
|---|---|---|
| `pin:{profile_id}` | lat, lng (jittered), audience, hide_from_hidden | user-chosen (30 m–3 h) |
| `presence:{cell_r8}` | Phoenix Presence | live |
| `rl:{account}:{action}` | counters | window |
| `checkin:{token}` | due_at, contact relay tokens | until due + 15 min |
| `ip:{hash}` | abuse counters | 24 h |

## Object storage
- `public/{photo_id}.avif` — public photos (plaintext, CDN, signed URL 1 h).
- `blob/{random}` — E2EE media (ciphertext), deleted on all-recipients-ack or 30 d.

## Device-only (SQLCipher)
Chats, private notes & tags, trusted contacts list, health reminders, received media, albums keys, MLS state, recovery phrase (never stored, shown once).

## Retention
| Data | Retention |
|---|---|
| Undelivered ciphertext | 30 d |
| Location cell | overwritten; deleted on Hidden or 24 h inactivity |
| Exact pin | TTL |
| Tonight / Now / activity posts | expiry + 1 h |
| Reports | 1 y (legal), franked payload deleted after decision + 90 d |
| Deleted account | hard delete ≤ 24 h; backups roll off ≤ 30 d |
