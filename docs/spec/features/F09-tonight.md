# F-09 Now & Tonight

## Now
- R-09.1 Now status: none · now · hosting · can travel · door open. Optional text 80 chars. TTL 1 / 2 / 3 / 6 h. Verified only.
- R-09.2 Setting Now first time triggers progressive fields (position, hosting) sheet.
- R-09.3 Now profiles: badge on cards/pins, sorted first after exact, pulse animation < 10 min.
- R-09.4 Ending: manual, TTL, or app detects user marked "Done" from notification action.

## Tonight (S-13)
- R-09.5 Tonight tab shows plans for today until 06:00 local, area within 10 km (radius widens if sparse).
- R-09.6 Time slider (now → 03:00) filters plans whose window overlaps selection; default now → +4 h.
- R-09.7 Featured: parties nearby with free spots appear as large cards at top (F-10), max 2.
- R-09.8 Plan card: avatar, name, verified, distance bucket, text, window chip, tag chip; tap → profile; long-press → message.
- R-09.9 Post plan (FAB "Post your plan"): window start/end, text optional 140 (empty → tag shown as the line), tag (hosting, can travel, drinks first, party, other), audience (verified default / my chats). Max 2 active plans. Verified only.
- R-09.10 Mode applies: Hookup shows hookup plans; Sport shows activity posts (F-11) today; Friends shows friends plans.
- R-09.11 Expiry 06:00 local or window_end + 1 h, whichever first.

## Acceptance criteria
- AC-09.1 Plans disappear from API ≤ 1 min after expiry.
- AC-09.2 Unverified cannot post Now/Tonight (403).
