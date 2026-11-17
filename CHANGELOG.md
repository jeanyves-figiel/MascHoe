# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- Mockups/design: unified 4 tabs (Explore, Tonight, Chats, Me); Hookup/Sport/Friends mode switch on Explore replaces intent chips and Activities tab; separate Map screen retired.
- Concept §6.2: exact pins visible to hidden/incognito viewers too (no give-to-get); pin owner's audience setting is the only filter.

### Added
- `docs/concept/onboarding-and-design.md`: login options (passkey default, Apple/Google/email, no phone), 6-step onboarding < 60 s, progressive profiling, design system (mode colours, type, nav), design audit. Mockups: onboarding row (Welcome, Sign up, Basics, Location, Photo, Verify).
- Concept: share posts from X, Bluesky, OnlyFans, JustFor.Fans to members (share sheet, device-side E2EE preview, blurred explicit, verified linked accounts, anti-bot guardrails).
- `docs/concept/profile-and-settings.md`: own-profile fields with per-field visibility (Public / Verified / My chats / Only me), up to 3 profiles, Preview-as, full settings tree. Mockups: Me + Settings boards.
- Concept §6.2: Area default ~500 m (H3 res 8, k-anonymity fallback to res 7); give-to-get rule for exact pins; viewing rules for grid/map.
- Mockups canvas: 7 new v1 screens (map-first home, Tonight board, party hosting, Activities, venue check-in, profile switcher + private notes, verification).
- Concept MVP scope: map-first home, social hookup features and Activities moved into v1 (owner decision).
- Concept: approved features: group/party hosting, private profile notes, disappearing chats default, multiple profiles, venue check-in, Tonight board.
- Concept: Activities intent (gym buddies, sports): SFW activity profile, activity posts, open-to-more flag, queer clubs/teams, gym venues.
- Concept: home screen = map first with Active-now card tray and Map/Grid toggle (owner decision); mockup added to canvas.
- Concept v0.3: audience = anyone who identifies as a man (incl. trans, non-binary); App Store + Play distribution; photo policy (1 vanilla main + 4 spicy public, AI-checked; unlimited private albums incl. video, E2EE); worldwide day-1 launch with density mitigations.
- Concept v0.2: hookup-first positioning (friends/chat secondary); user-chosen location precision (Hidden / City / Area default / Exact opt-in with auto-expiry, audience control, off in Safe Mode); anti-bot section §9.1 (verification gate, device attestation, shadow quarantine, creator label); map + anti-bot moved into MVP; link to key-screen mockups.
- `docs/concept/product-concept.md`: product concept v0.1 — competitor scan (Grindr, Scruff, Romeo, Hornet, Jack'd, Taimi, Feeld, Sniffies), privacy-incident lessons, privacy-by-design architecture (E2EE, H3 cell location, local-first), verification without doxxing, hostile-country Safe Mode, moderation, no-ads monetization, MVP scope, moat/retention, "mistakes not to repeat" (complaint → rule), interconnection with other apps evaluation, risks.
- `CHANGELOG.md`.
