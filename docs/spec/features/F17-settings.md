# F-17 Settings

Full tree: [concept/profile-and-settings.md §3](../../concept/profile-and-settings.md). Behavioural rules:

- R-17.1 All settings free. No setting behind Plus.
- R-17.2 Settings sync across own devices E2EE (settings blob encrypted to account key); server stores only what it must enforce (visibility, message permissions, safe_mode, hide_from_hidden, incognito).
- R-17.3 Safe defaults: verified-only messaging, explicit media blur, disappearing 7 d, previews None, watermark on, creators hidden.
- R-17.4 Search field at top of Settings (S-61).
- R-17.5 Symmetry rules: hiding online status/read receipts hides others' to you. Read receipts also cover Delivered ticks and typing, with a per-chat override (F-07 R-07.23).
- R-17.6 "Who can message me": everyone verified (default) · only people I tapped · only people matching my filters.
- R-17.7 "Hide from": age ranges, accounts < 7 days, unverified (default on).
- R-17.8 Destructive actions (delete account, panic wipe setup) require biometrics.
- R-17.9 App: language, units, theme: none (single Pop theme, see design-system.md), accent per mode (fixed palette), haptics, data saver (thumbnails only on cellular).

## Acceptance criteria
- AC-17.1 Every setting in the tree has an API field or local key documented in data-model/api.
- AC-17.2 Changing a setting on device A reflects on device B ≤ 10 s.
