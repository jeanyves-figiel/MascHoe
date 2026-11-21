# F-04 Explore: map, grid, modes, filters

## Purpose
Home tab. See who's around now, fastest path to a message.

## Layout (S-10 map, S-11 grid)
Top: **live header** (R-04.17, #104, option A of the [top bar mockup](https://claude.ai/artifact/WsFGPds2rrv37q3AP6RcU1)): row 1 wordmark · Filters button · own avatar (Now); row 2 place name + level chip + live counts (tap → S-30); row 3 mode tiles **Hookup · Friends · Sport** with counts. Body (#100, concept A of the [blend mockup](https://claude.ai/artifact/J74uiYDyi1vJ9URjttLke9)): the map fills the screen and a pull-up **grid sheet** sits over it (R-04.14). There is no Map/Grid toggle: the sheet's full state is the grid. Tab bar: Explore · Tonight · Chats · Me.

## Rules
- R-04.1 Mode is the viewer's lens (F-06 R-06.1a/b): it shows profiles whose `show_in` includes the mode, rendered through that lens, and recolours UI (mode tokens, design-system). Mode persists across launches. Switching mode never changes the viewer's own profile. If the viewer isn't shown in the current mode: one-line banner "You're not shown in Friends · Show me" (turns it on; Sport runs the mini-setup first).
- R-04.2 Map: MapLibre, dark style. Shows (a) cell heat for Area users at k-anon resolution, (b) avatars of Area users placed at random stable positions inside their cell (seed = profile_id + day), (c) exact pins for Exact users the viewer is allowed to see (F-05), (d) party/venue/activity markers by mode.
- R-04.3 Pins: avatar 36 px, mode-colour ring; "door open"/"hosting" badge; countdown ring for TTL; pulse animation for Now status posted < 10 min ago (reduced-motion: static).
- R-04.4 Sort (grid sheet and `GET /explore/tray`): exact by metres → Now → area by cell distance → online recency. The horizontal tray is replaced by the grid sheet (#100); `GET /explore/tray` stays for the sheet title count ("Active now · N").
- R-04.5 Grid (inside the sheet, R-04.14): 3 columns, card = main photo, name, verified tick, online dot, distance bucket, Now/Exact badge. Infinite scroll, page 60. Same sort as tray. No paywall, no cap.
- R-04.6 Distance buckets: exact "45 m"/"1.2 km"; area "< 200 m", "200–500 m", "500 m–1 km", "1–2 km", "2–5 km", "5–10 km", "10+ km"; city "In {city}".
- R-04.7 Sparse areas: if < 30 profiles within 10 km, grid widens radius automatically up to 100 km and labels section "Further away".
- R-04.8 Filters sheet (all free): age range; distance max; verified only (default on); online now; has Now status; position (hookup, verified viewers only); hosting; tribes; body; looking for; Sport: sports, level, schedule, intent; hide creators (default on); new members only. Saved per mode. Never filterable: HIV status, ethnicity, languages (#106: chats translate on device instead, F-07 R-07.25).
- R-04.9 Viewer filtering server-side: never return blocked (both ways), paused, quarantined (to others), Hidden users; respect `hide_from_hidden` when viewer is Hidden; respect profile `visibility_map` for card fields.
- R-04.10 Unverified viewer: sees cards and buckets ≥ "1–2 km" only, no pins; tapping message shows verify prompt.
- R-04.11 Performance: first grid paint < 300 ms p95 (cached last result shown instantly, refreshed in background); map tiles cached offline for last city.
- R-04.12 Pull-to-refresh on grid; map updates live via `cell:{r7}` channel.
- R-04.13 Map centring (#95). The map opens centred on the viewer's own device position at start zoom (12), whatever their location level (Hidden / City / Area / Exact): how others see you never changes what you see. The raw position stays on the device; only cells are sent (R-05.1). Order: (1) device GPS (last known fix first for an instant start, then a fresh fix), (2) own Exact pin, (3) last sent area cell, (4) own stored cell (`location.cell_r5` from `GET /me`, City users without permission), (5) world view. When Explore opens and permission was never asked, ask once (iOS "When in use"). The map auto-centres once, when the first usable position arrives, unless the user has already panned or zoomed. Start zoom follows R-04.15 (auto-fit) once `fit_m` is known, else 12. A "Locate me" button (44 px, round, white, bottom-right just above the sheet, moves with it) recentres with a 600 ms ease; if permission is off it opens the Location sheet. The own dot is drawn at the device position (falls back to the centre above).
- R-04.14 Grid sheet (#100). A bottom sheet over the map holds the grid (R-04.5). Three snaps, measured from the bottom of the screen area above the tab bar: **peek** (title row + top of the first tile row, about 25 %), **half** (default, about 50 %), **full** (up to just below the header; the map is hidden). Drag the handle or the title row to move it (spring, `motion.slow`); release snaps to the nearest snap or, on a fling, the next one in the fling direction; tapping the handle cycles peek → half → full → peek. Last snap is remembered per device. In full the grid scrolls (infinite scroll, pull-to-refresh); in peek/half the grid scrolls inside the visible part. Title row: "Active now · N" (N = tray count, real) or "Nearby" when N = 0, right side "Nearest first". The Locate me button and the zoom note ride 12 pt above the sheet edge. Reduce Motion: snaps without spring.
  - Pin ↔ tile: tapping a map pin selects it: the pin grows 44 → 58 px with a coral ring and a white name chip "Name, age · distance" below; its tile in the sheet gets a 3 px mode-colour ring and the sheet scrolls it into view (half if it was peek). Tapping the chip or the tile opens S-20. Tapping the map elsewhere clears the selection. Long-press on a tile keeps quick actions.
  - Map camera padding: the map's visible centre is the part above the sheet, so centring and auto-fit keep the viewer's dot and nearest people above the sheet.
- R-04.15 Auto-fit zoom (#100). `GET /explore/grid` returns `fit_m`: the radius reaching the 12th nearest visible person (or the furthest, if fewer), rounded **up** to one of 500, 1 000, 2 000, 5 000, 10 000, 25 000, 50 000, 100 000 m; at least 2 000 for unverified viewers (R-04.10); `null` when nobody is visible. On the first centring and on each Locate me, the client sets zoom so a circle of `fit_m` around the viewer fits the map area above the sheet (zoom clamped 9–15; `null` → 12). A small chip above the sheet says why: "Fitted to your nearest people" or, when `fit_m` ≥ 5 000, "Zoomed out to reach people". The rounding means `fit_m` never tells more than the distance buckets already shown.
- R-04.16 Quiet area and empty states (#100). Never show invented counts or filler profiles.
  - Quiet: nobody within 2 km (first grid card is `further` or its bucket ≥ 2–5 km) and at least one card: sheet title "Quiet right here", sub "Nobody active within 2 km yet. Here's who's further out."; a "Be the first one here" card (Post a Now → Now sheet; unverified → Verify) ; then the grid under a "Further away" label; then, if `GET /tonight` returns plans, one row "Tonight near you · N plans" → Tonight tab.
  - Unverified viewer with no cards: sheet shows a teal card "Verify to see who's here. Most guys only show to verified members." → Verify. The map keeps count bubbles only (R-04.10).
  - Nobody at all (verified, 100 km): existing empty state (title "Nobody visible here yet", Filters action) inside the sheet, plus the Post a Now card.
- R-04.17 Live header (#104). Replaces the static top bar.
  - Row 1: wordmark (left). Filters button (44 pt round `bg.raised`, badge = number of filters that differ from the defaults, hidden at 0). Own avatar button (44 pt; main photo or initials): ring dashed in the mode colour when the viewer has no Now status, solid when Now is on; tap → Now sheet (F-09).
  - Row 2 (one button, tap → Location sheet S-30): place name as a 30 pt headline + chevron. Place = name of the nearest city (`cities` table) to the viewer's own query cell, never a finer place; "Somewhere" when unknown. Under it: teal level chip (pin icon + "Area · ~200 m", "City", "Exact" or "Hidden"), a mode-colour live dot, then "**N** around · **M** Now" (Sport: "**N** around" only, no Now in Sport).
  - Row 3: three equal mode tiles (74 pt, radius 20): icon (flame / two people / dumbbell), count top-right, label bottom. Active tile filled with the mode colour, ink text, soft coloured shadow; inactive `bg.raised` with the icon on a mode-tinted disc. Tap switches mode (same as the old segmented control, `tablist` semantics).
  - Behind the header, a soft radial glow of the active mode colour (22 % alpha) fades into ink; it cross-fades on mode switch (Reduce Motion: instant).
  - Counts come from `GET /explore/summary` (api.md): N = people the viewer can see in that mode within 10 km (same visibility rules as the grid, R-04.9, R-04.10); active mode with the viewer's filters, other modes with default filters; M = those with an active Now status. Shown as is up to 99, then "99+". No count yet / error: the number slot shows "·" (never a made-up number). 0 is shown as 0.
  - Banners: the verify nudge leaves the header and becomes a slim teal row at the top of the grid sheet ("Verify to see faces and message first" + "Verify"). Missing main photo, "not shown in this mode" (R-04.1) and Safe Mode banners keep the slot under row 3, one at a time in that order.

## Interactions
| Gesture | Result |
|---|---|
| Tap mode segment | Recolour animation 250 ms; reload data |
| Tap pin | Select it: bigger pin + name chip, tile highlighted in the sheet, **peek card** above the sheet edge (photo, name, tick, distance · Online, ⋯ → S-21 safety sheet; tap card → profile) (R-04.14, #111). Second tap on the selected pin opens the profile |
| Tap name chip / tile | Profile S-20 |
| Drag / tap sheet handle | Sheet snaps peek · half · full (R-04.14) |
| Long-press card | Medium haptic, safety sheet S-21 (F-15 R-15.17): Open profile, Tap, Message, then Hide / Block / Report tiles (#111) |
| Tap location pill | Location sheet S-30 |
| Tap Filters | Filters sheet S-12 |
| Map pan/zoom | Join/leave `cell:{r7}` topics for viewport (max 12) |
| Tap Locate me | Recentre on own position (R-04.13) |

## Edge cases
- No location permission → city level; map centred on chosen city (R-04.13 fallback 4); banner to enable.
- Offline → cached grid with "Offline" chip; actions queued.
- Viewer in Safe Mode → map shows only city-level counts, no pins, grid only verified.

## Acceptance criteria
- AC-04.1 3 taps max from cold start to compose a message to nearest person.
- AC-04.2 No API response contains another user's raw coordinates unless they're an Exact pin allowed for the viewer.
- AC-04.3 Hidden users never appear in any Explore response.
- AC-04.4 Mode switch recolours all surfaces incl. tab bar within 250 ms.
- AC-04.5 Fresh install, permission granted, any location level: Explore map shows the viewer's own position at zoom 12 within 3 s of opening, without user action.
- AC-04.6 Explore shows the map and the grid sheet together; no Map/Grid toggle. The sheet snaps peek/half/full and the last snap survives a restart.
- AC-04.7 With 12+ people within 1 km, the map opens at the zoom fitting `fit_m` = 1 000 m above the sheet, not at zoom 10/12.
- AC-04.8 Tapping a pin highlights the same person's tile; tapping the chip opens their profile (AC-04.1 still ≤ 3 taps).
- AC-04.9 Nobody within 2 km: "Quiet right here" + Further away; no number on screen that is not a real count.
- AC-04.10 Header counts match `GET /explore/summary` for each mode; a profile hidden from the viewer (blocked, hidden, hide-from-unverified…) is never counted; place name is city-level only.
