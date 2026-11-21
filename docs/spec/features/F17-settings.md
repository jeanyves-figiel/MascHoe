# F-17 Settings

Full tree: [concept/profile-and-settings.md §3](../../concept/profile-and-settings.md). Behavioural rules:

- R-17.1 All settings free. No setting behind Plus.
- R-17.2 Settings sync across own devices E2EE (settings blob encrypted to account key); server stores only what it must enforce (visibility, message permissions, safe_mode, hide_from_hidden, hidden).
- R-17.3 Safe defaults: verified-only messaging, explicit media blur, disappearing 7 d, previews None, watermark on, creators hidden.
- R-17.4 Search field at top of Settings (S-61).
- R-17.5 Symmetry rules: hiding online status/read receipts hides others' to you. Read receipts also cover Delivered ticks and typing, with a per-chat override (F-07 R-07.23).
- R-17.5b Translate messages (device-only, F-07 R-07.27): Automatic / Tap / Off; per-chat switch in chat ⋯.
- R-17.6 "Who can message me": everyone verified (default) · only people I tapped · only people matching my filters.
- R-17.7 "Hide from": age ranges, accounts < 7 days, unverified (default on).
- R-17.8 Destructive actions (delete account, panic wipe setup) require biometrics.
- R-17.10 Structure (#102): Settings is a hub of 5 categories (Privacy & visibility, Chats & media, Notifications, Safety, Account) plus App and About inline. At most 2 levels deep; every category row shows a summary of its current values.
- R-17.11 No label is used twice: lenses are "Show me in" (Me, F-06); surfaces are "Appear on" (Grid, Map, Tonight, Activities, Venues).
- R-17.12 Location level (incl. Hidden's Stay hidden / Come back as, #114) and Now are set on Me (one tap); Settings links there, it does not duplicate them. Date check-in lives on Me; Safety settings hold Safe Mode, app lock, verification, blocked, notices.
- R-17.13 Destructive and leaving actions are grouped last in Account; Delete account opens its own confirm (R-17.8).
- R-17.9 App: language, units, theme: none (single Pop theme, see design-system.md), accent per mode (fixed palette), haptics, data saver (thumbnails only on cellular).

## Acceptance criteria
- AC-17.1 Every setting in the tree has an API field or local key documented in data-model/api.
- AC-17.3 Every setting reachable in ≤ 2 taps from Me (gear → category); search finds any setting by its label.
- AC-17.2 Changing a setting on device A reflects on device B ≤ 10 s.
