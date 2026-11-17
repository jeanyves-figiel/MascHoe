# F-12 Venues & check-in

## Rules
- R-12.1 Venue catalogue: curated by team + partner venues (kind sauna, bar, club, gym, other). Fields: name, kind, cell r9, geofence radius (30–150 m), hours. No user-created venues in beta.
- R-12.2 Check-in: manual from venue page or prompt when inside geofence ≥ 3 min (prompt only, never automatic). Verified only.
- R-12.3 Visibility inside venue: "visible to others here" toggle (default on). Only people currently checked in **and** visible see each other. Outside the venue nobody sees check-ins; no history kept.
- R-12.4 "Here now" grid (S-17): checked-in visible profiles, newest first, sub-label (zone free text like "steam room" optional), "tapped you" highlight.
- R-12.5 Stats header: total checked in (count incl. invisible, rounded if < 5 → "a few"), visible to you, tapped you.
- R-12.6 Auto check-out: leaving geofence for 10 min, or 4 h, or venue closing time. Manual "Check out" / "Go invisible".
- R-12.7 Mode: gyms show in Sport mode; saunas/bars/clubs in Hookup; bars in Friends too.
- R-12.8 Safe Mode: venue check-in disabled.

## Acceptance criteria
- AC-12.1 GET /venues/{id}/here returns 403 if caller not checked in.
- AC-12.2 venue_checkins rows deleted at check-out (no history table).
