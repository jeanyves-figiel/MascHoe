# F-16 Notifications

## Rules
- R-16.1 Push = content-free wake-up (api.md). App fetches and renders a **local** notification per settings.
- R-16.2 Types (each toggle in Settings): new message, new tap, mutual tap, party request (host), party accepted (guest), address received, Tonight match (someone posts a plan matching your filters nearby — max 3/night), activity join, club event, venue tap, check-in due, check-in alert (contact side), verification done, moderation notice.
- R-16.3 Preview levels: None (default: "New message") · Name only · Full. Safe Mode forces None + generic title "Reminder".
- R-16.4 Quiet hours (default off); check-in and safety alerts bypass quiet hours.
- R-16.5 Grouping: per chat; max 1 sound per chat per 2 min.
- R-16.6 Actions: reply inline (text), "Done" for Now status, "I'm OK" for check-in.
- R-16.7 Permission asked on first inbound event (F-02 R-02.9), with pre-prompt explaining content-free design.
- R-16.8 Badge count = unread chats.
- R-16.9 No marketing pushes. Product announcements only in-app.

## Acceptance criteria
- AC-16.1 APNs/FCM payload inspection shows no names, text or image URLs.
- AC-16.2 Safety notifications delivered during quiet hours.
