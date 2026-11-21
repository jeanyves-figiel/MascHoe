# F-19 Gestures & haptics

Issue [#187](https://github.com/jeanyves-figiel/Thirstr/issues/187). Mockup with picks: [Gestures](https://claude.ai/artifact/CPdgwYCbyyA6oPgHk1CRZm).

## Purpose
Make the app fast to use with one hand: the common actions (reply, react, archive, Tap, next profile, close) are one gesture away, without hiding anything. Every gesture is a shortcut, never the only way.

## Scope
Beta: G1–G18 below, as picked on the mockup. Out of scope: swipe between tabs (conflicts with map pan and the photo pager), card-stack yes/no swipe (Thirstr is grid and map first), shake gestures (false triggers), swipe-to-delete a chat (data loss by mistake).

## Global rules
- R-19.1 **Visible alternative.** Every gesture has a visible control that does the same thing (listed per gesture). A gesture is never the only path.
- R-19.2 **Screen readers.** Every gesture is also an `accessibilityActions` entry on its element (VoiceOver rotor / TalkBack actions menu) with the same label as its visible control. Covered by tests.
- R-19.3 **UI thread.** Gestures use `react-native-gesture-handler` v2 + `react-native-reanimated` (worklets). No JS runs per frame; JS is called once, on commit (`runOnJS`). No `PanResponder` and no `Animated` JS driver for gestures.
- R-19.4 **System gestures win.** The iOS left back edge (first 24 pt) and Android system back / home gestures are never captured. Horizontal row swipes start only after 12 pt horizontal travel with |dx| > 1.5·|dy|, so vertical scroll always wins.
- R-19.5 **Reduce Motion.** With OS Reduce Motion on, follow-the-finger stays (it is direct manipulation) but springs become 150 ms timing curves and bursts (heart, Tap) become a fade.
- R-19.6 **Thresholds.** Commit threshold = 30 % of the travel or velocity > 800 pt/s. Crossing it plays one `tick` haptic and the action icon fills; going back under it cancels silently.
- R-19.7 **Undo.** Any gesture that moves or hides content (archive, close profile with unsent note) shows a 4 s toast with Undo.
- R-19.8 **Haptics** (G17). Four tokens only, in `ui/haptics.ts`: `tick` (selection, threshold, sheet stop), `tap` (action done), `success` (Tap sent, reply sent from gesture), `warning` (Block, Report, SOS). Off when Settings → Haptics is off or iOS Low Power Mode is on. Never on scroll or per frame.
- R-19.9 **Web build.** Gestures that need touch (G1, G2, G5, G8–G13) are no-ops on web; the visible alternative is used.

## Gestures

| # | Where | Gesture | Result | Visible alternative |
|---|---|---|---|---|
| G1 | Chat message (any) | Swipe right ≥ 56 pt | Reply: quote card above composer (name + first 80 chars or "Photo"), composer focused. Payload `reply_to: msg_id` | Long-press menu → Reply |
| G2 | Chat message (theirs) | Double-tap | ❤️ reaction toggled; heart pops on the bubble | Long-press → ❤️ |
| G3 | Chat message | Long-press 350 ms | Bubble lifts (scale 1.04), chat dims, reaction bar (❤️ 🔥 😂 😮 👍 ＋) above, actions below (Reply, Copy, Translate, Report, Delete for me). Slide to an emoji and release = react in one move | — (it is the menu) |
| G4 | Chat | Swipe list left | Send times slide in on the right; release snaps back | Tap a message shows its time |
| G5 | Chats list row | Swipe left | Reveals Mute + Archive; full swipe (> 60 %) archives, toast + Undo | Long-press menu |
| G5 | Chats list row | Swipe right | Favorite (1:1) or Pin (group), toggles | Long-press menu |
| G6 | Chats, Taps, Albums, Hidden & blocked, Party, Activity, Club, Venue | Pull down | Refresh from server; spinner in mode colour | Lists update live |
| G7 | Explore grid sheet | Drag handle / sheet | Follows finger; 3 stops; fling (> 800 pt/s) goes to next stop; rubber band above top; `tick` at each stop | Tap handle cycles stops |
| G8 | Explore grid | Pinch | 2 ↔ 3 ↔ 4 columns, remembered per device | Filters → Grid size |
| G9 | Profile photo | Tap right / left 40 % | Next / previous photo; bars on top show position | Tap a bar |
| G10 | Profile (from grid) | Swipe left / right (outside left 24 pt) | Next / previous profile in grid order; at the end, bounce | ‹ › in header |
| G11 | Profile photo | Double-tap | Sends Tap once; coral burst; `success`. Already tapped: nothing | Tap button |
| G12 | Profile at scroll top | Pull down > 120 pt | Closes; shrinks toward its tile | Back button |
| G13 | Full-screen photo viewer (profile, album, chat) | Pinch / double-tap / swipe / swipe down | Zoom 1–4×, double-tap toggles 1×/2.5× at point, swipe next / prev, swipe down > 100 pt closes. View-once: no swipe to others, no save | ✕, ‹ › |
| G14 | All stack screens (iOS) | Swipe right from anywhere | Back (`fullScreenGestureEnabled`). Off on Profile (G10), Chat (G1), photo viewer (G13), where only the edge works | Back button |
| G15 | Every `Sheet` | Drag down on handle / header, or on content scrolled to top | Closes past 30 % or fling | ✕, tap outside |
| G16 | Tab bar | Long-press 400 ms | Explore: lens picker; Me: Hidden on/off (verified only, else explains); Chats: first unread chat | Lens switcher, Me → Hidden, inbox |
| G17 | App | — | Haptics tokens (R-19.8) | Settings → Haptics |
| G18 | App | — | Accessibility actions (R-19.2) | — |

## Data
- G1 adds optional `reply_to` (message id) and `reply_preview` (≤ 80 chars, sender display name) inside the E2EE `text` payload. Server unchanged (payload is opaque). Old clients ignore unknown fields and show the plain text.
- G8 grid size: device setting `explore.cols` (2|3|4, default 3), plain storage (not private).

## Performance
- Swipeable rows (G1, G5) are one gesture detector per visible row, recycled with the list; no per-row timers.
- Photo viewer (G13) loads the full photo only when opened; zoom uses the cached image (no re-download).
- No gesture adds a network request except its committed action.

## Testing
- Unit: thresholds, velocity commit, a11y actions present per element (`__tests__/gestures.test.tsx`).
- Manual on DEV: iPhone (edge back still works on every screen), Android (system back), VoiceOver pass on Chat, Chats list, Profile.
