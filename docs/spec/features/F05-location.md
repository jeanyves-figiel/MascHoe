# F-05 Location & visibility

## Levels
| Level | Others see | Sent to server | Who can use |
|---|---|---|---|
| Hidden | nothing | cell r8 (own queries only, not indexed) | **verified only** |
| City | "In Paris" | cell r5 | all |
| Area (default) | bucket, avatar inside ~200 m zone | cells r9/r8/r7/r5 | all |
| Exact | pin ± jitter, metres | cells + lat/lng (RAM, TTL) | verified only |

## Rules
- R-05.1 Device computes H3 cells locally; only cell IDs leave the device except for Exact.
- R-05.2 k-anonymity: a profile is placed at r9 only if its r9 cell has ≥ 5 visible profiles; else r8 (≥ 5) else r7. Evaluated server-side every minute.
- R-05.3 Area avatar position on map = deterministic random point inside displayed cell (seed profile_id + UTC date). Never the true point.
- R-05.4 Exact: requires explicit confirm each activation; TTL 30 min / 1 h / 2 h / 4 h (max 4 h, owner decision 2026-11-17). Jitter uniform 10–20 m, re-drawn on each set. Audience: verified (default) · my chats · everyone. Server stores in Valkey only.
- R-05.5 Exact pins visible to Hidden viewers **unless** owner sets "Hide me from hidden users".
- R-05.6 "Hide me from hidden users" (default off): when on, Hidden viewers never receive this profile in any surface.
- R-05.7 (#114) **Hidden absorbs Incognito** (there is no separate Incognito). Hidden (verified only) takes the account off map, grid, Tonight and venues; it still browses, chats and sees pins; existing chats still see it. Choosing Hidden shows, under the level control (S-60, S-30): **Stay hidden** 1 hour / Until 6 AM (next 06:00 local) / 24 hours / Until I switch (default; Me keeps the current City/Area as the return level), and **Then come back as** City / Area (default Area). `PUT /me/location {level:"hidden", until?, return_level?}`; `until` ISO 8601, future, ≤ 48 h, else 422. `GET /me` returns `hidden_until` and `hidden_return`. When `until` passes, the app (on launch, foreground, or a timer while open) sets the return level with a fresh cell; until then the server keeps the account Hidden (fails private). Any non-Hidden level clears both. `PATCH /me/visibility {incognito: true}` → 422 (old builds). Migration: Incognito accounts became Hidden until I switch, coming back as their previous City/Area (Exact → Area).
- R-05.8 Location updates: on significant move (> 100 m) or every 5 min foreground; background updates only while Exact "until I leave" active or check-in running. Rate limit 1/30 s.
- R-05.9 Velocity check: implied speed > 900 km/h between updates → flag (spoofing); 3 flags/24 h → quarantine review.
- R-05.10 Safe Mode: Exact disabled (override requires second warning screen), default City.
- R-05.11 Per-chat exact share: E2EE message type `location.share` {lat, lng, ttl} rendered as map card, auto-hides at TTL. Never touches location tables.
- R-05.12 Inactivity: no update for 24 h → cell deleted, profile drops from Explore until next open.

## Interactions (S-30 Location sheet)
Radio list 4 levels (Hidden disabled "After you verify" for unverified) · Exact settings (TTL chips, audience chips) · "Others see" live preview · toggle "Hide me from hidden users" · Safe Mode note.

## Acceptance criteria
- AC-05.1 Trilateration test harness (spoofed viewer, 100 vantage points) cannot locate an Area user better than their displayed cell.
- AC-05.2 Exact pin absent from Valkey and API after TTL + 5 s.
- AC-05.3 Valkey config has persistence disabled in all envs.
- AC-05.4 Unverified account cannot set Hidden or Exact (403 not_verified).
- AC-05.4a (#114) Hidden with `until` in the past, > 48 h ahead, or `return_level` not city/area → 422; Hidden with `until`/`return_level` reflected in `GET /me`; switching to City/Area/Exact clears them.
