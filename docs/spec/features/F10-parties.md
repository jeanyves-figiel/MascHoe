# F-10 Parties

## Purpose
Host or join group hookups/parties safely.

## Rules
- R-10.1 Create (verified, account age ≥ 7 d): title 40, start/end (max 12 h), capacity 2–50, rules (chips: age range, PrEP/safer, vers welcome, no chems, custom ×3), audience (verified · my chats · invite only), approximate area (cell r8 auto). Max 3 created/day, 1 live at a time.
- R-10.2 Discovery: Tonight featured cards, map marker (party icon) at cell r8 centroid, never exact.
- R-10.3 Request to join: one tap; requester profile + vouches + verified shown to host. Requests expire at party end.
- R-10.4 Host actions: accept / decline (silent to requester: "Not this time"), remove guest, mark full, cancel, end. Co-host (1) optional.
- R-10.5 On accept: requester added to party MLS group "Guest chat"; host sends **address & door code** as E2EE message (template prefilled from host device, never stored server-side). Option "send address 30 min before start".
- R-10.6 Seat meter = accepted / capacity, realtime on `party:{id}`.
- R-10.7 After end: guest chat stays 24 h then auto-deletes (default); optional host rating (thumbs) visible as count after ≥ 3 ratings.
- R-10.8 Safety: any guest can report party; 2 reports → party hidden pending review. Check-in (F-13) suggested on accept.
- R-10.9 Safe Mode: party creation disabled; viewing only invite-only parties.

## Screens
S-14 Party detail (host view: requests list; guest view: status, rules, chat), S-15 Create party sheet.

## Acceptance criteria
- AC-10.1 No party API returns street address or exact coordinates.
- AC-10.2 Capacity never exceeded under concurrent accepts (transactional).
- AC-10.3 Guest chat auto-deleted 24 h after end on all devices.
