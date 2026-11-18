# F-04 Explore: map, grid, modes, filters

## Purpose
Home tab. See who's around now, fastest path to a message.

## Layout (S-10 map, S-11 grid)
Top: wordmark · Map/Grid toggle · location pill (current level, tap → S-30). Row 2: mode switch **Hookup · Sport · Friends** + Filters button. Body: map or grid. Map has bottom tray "Active now · N" (horizontal cards). Tab bar: Explore · Tonight · Chats · Me.

## Rules
- R-04.1 Mode is the viewer's lens (F-06 R-06.1a/b): it shows profiles whose `show_in` includes the mode, rendered through that lens, and recolours UI (mode tokens, design-system). Mode persists across launches. Switching mode never changes the viewer's own profile. If the viewer isn't shown in the current mode: one-line banner "You're not shown in Friends · Show me" (turns it on; Sport runs the mini-setup first).
- R-04.2 Map: MapLibre, dark style. Shows (a) cell heat for Area users at k-anon resolution, (b) avatars of Area users placed at random stable positions inside their cell (seed = profile_id + day), (c) exact pins for Exact users the viewer is allowed to see (F-05), (d) party/venue/activity markers by mode.
- R-04.3 Pins: avatar 36 px, mode-colour ring; "door open"/"hosting" badge; countdown ring for TTL; pulse animation for Now status posted < 10 min ago (reduced-motion: static).
- R-04.4 Tray: up to 20 cards, sorted: exact by metres → Now → area by cell distance → online recency. Tap card → S-20 profile. Swipe horizontally.
- R-04.5 Grid: 3 columns, card = main photo, name, verified tick, online dot, distance bucket, Now/Exact badge. Infinite scroll, page 60. Same sort as tray. No paywall, no cap.
- R-04.6 Distance buckets: exact "45 m"/"1.2 km"; area "< 200 m", "200–500 m", "500 m–1 km", "1–2 km", "2–5 km", "5–10 km", "10+ km"; city "In {city}".
- R-04.7 Sparse areas: if < 30 profiles within 10 km, grid widens radius automatically up to 100 km and labels section "Further away".
- R-04.8 Filters sheet (all free): age range; distance max; verified only (default on); online now; has Now status; position (hookup, verified viewers only); hosting; tribes; body; looking for; languages; Sport: sports, level, schedule, intent; hide creators (default on); new members only. Saved per mode. Never filterable: HIV status, ethnicity.
- R-04.9 Viewer filtering server-side: never return blocked (both ways), paused, quarantined (to others), Hidden users; respect `hide_from_hidden` when viewer is Hidden/incognito; respect profile `visibility_map` for card fields.
- R-04.10 Unverified viewer: sees cards and buckets ≥ "1–2 km" only, no pins; tapping message shows verify prompt.
- R-04.11 Performance: first grid paint < 300 ms p95 (cached last result shown instantly, refreshed in background); map tiles cached offline for last city.
- R-04.12 Pull-to-refresh on grid; map updates live via `cell:{r7}` channel.

## Interactions
| Gesture | Result |
|---|---|
| Tap mode segment | Recolour animation 250 ms; reload data |
| Tap pin / card | Profile S-20 (sheet on map, full screen on grid) |
| Long-press card | Quick actions: tap, message, hide this profile, block |
| Tap location pill | Location sheet S-30 |
| Tap Filters | Filters sheet S-12 |
| Map pan/zoom | Join/leave `cell:{r7}` topics for viewport (max 12) |

## Edge cases
- No location permission → city level; map centred on chosen city; banner to enable.
- Offline → cached grid with "Offline" chip; actions queued.
- Viewer in Safe Mode → map shows only city-level counts, no pins, grid only verified.

## Acceptance criteria
- AC-04.1 3 taps max from cold start to compose a message to nearest person.
- AC-04.2 No API response contains another user's raw coordinates unless they're an Exact pin allowed for the viewer.
- AC-04.3 Hidden users never appear in any Explore response.
- AC-04.4 Mode switch recolours all surfaces incl. tab bar within 250 ms.
