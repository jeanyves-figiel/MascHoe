# F-06 Profiles

Field catalogue and defaults: [concept/profile-and-settings.md](../../concept/profile-and-settings.md) (authoritative for field lists). This spec covers behaviour.

## Rules
- R-06.1 Up to 3 profiles per account: Now (created at onboarding), Sport, Friends (created lazily on first use of mode). Each has its own id, photos, fields. Viewers can't link them; server never returns account_id; block applies across all.
- R-06.2 Required to be visible: display name, age, gender, main photo (ok_main).
- R-06.3 Photos: 5 public max; slot 0 main (strict check), 1–4 public (permissive). Sport profile: all slots strict (SFW). Reorder by drag; main must stay ok_main.
- R-06.4 Per-field visibility: public / verified / chats / only_me. Server enforces for SV fields; for `chats` and `only_me` fields the server stores nothing — client sends values E2EE when a chat starts (R-06.6).
- R-06.5 Hookup fields (position, practices, hosting, groups, limits) default `verified`; health default `chats`, never `public` (UI disables it).
- R-06.6 Chat-shared fields: when a chat is created or a field changes, client sends an E2EE `profile.private` message to chat partners allowed by visibility; receiver caches locally.
- R-06.7 "Preview as": stranger / verified / chats — client renders own profile using the same visibility logic.
- R-06.8 Completeness ring = weighted % (photos 30, bio 15, body 10, looking for 10, hookup 15, prompt 10, languages 10).
- R-06.9 Private notes & tags on others' profiles: device-only, synced E2EE across own devices; max 500 chars + 10 tags; shown on S-20 in yellow dashed card.
- R-06.10 Profile view (S-20): hero photos (swipe), name/age/verified, distance, status line, tags, prompt, bio, mode-specific sections, linked accounts (I-01), vouches count, private note, actions: Tap · Message · ⋯ (block, report, hide, vouch).
- R-06.11 Edits propagate within 5 s; photo changes trigger re-check and possibly re-verify (F-03 R-03.7).
- R-06.12 Bio: 300 chars; links blocked for first 24 h after account creation and always for unverified; no phone numbers/emails (regex + nudge).
- R-06.13 Discriminatory phrases at write time → inline nudge; repeated → field hidden + moderation (F-15).

## Acceptance criteria
- AC-06.1 GET /profiles/{id} by stranger never returns fields with visibility ≠ public.
- AC-06.2 HIV status cannot be set to public via API (validation error).
- AC-06.3 Two profiles of one account cannot be correlated via any API field or timing of updates (updated_at fuzzed ±10 min).
