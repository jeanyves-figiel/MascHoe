# Design system: tokens, copy & i18n

Source of truth for `/design/tokens.json` and `/design/strings/`. Mockups: [canvas](https://claude.ai/artifact/TErsb1tkyu5qWo8JQxD6VG). Rationale: [onboarding-and-design.md](../concept/onboarding-and-design.md).

## Tokens (`/design/tokens.json`, W3C Design Tokens format)
Generated to TS (RN theme) by Style Dictionary in CI. Hard-coded colours/sizes in app code MUST fail lint.

### Colour
| Token | Dark (default) | Light | Use |
|---|---|---|---|
| `bg.base` | #0B0B0F | #FFFFFF | screen background |
| `bg.raised` | #16161D | #F4F4F7 | cards, sheets |
| `bg.overlay` | #1F1F28 | #FFFFFF | modals, menus |
| `fg.primary` | #F5F5F7 | #111116 | body text |
| `fg.secondary` | #A1A1AA | #52525B | meta text |
| `fg.muted` | #6B6B76 | #8A8A94 | disabled, hints |
| `line` | #2A2A33 | #E4E4E7 | dividers |
| `mode.hookup` | #FF7A33 | #E8611A | Hookup accent |
| `mode.sport` | #C6F432 | #6E9A00 | Sport accent |
| `mode.friends` | #A98BFF | #7A5AF0 | Friends accent |
| `trust` | #4DA3FF | #1F7AE0 | verified, location, links |
| `trust.soft` | #6FB6FF | #4B95EA | Area ring, pins |
| `safety` | #8FE3A0 | #1F9D4A | E2EE line, check-in OK |
| `danger` | #FF5A5F | #D92D33 | block, report, panic |
| `warn` | #FFC94D | #B07A00 | expiring pin, cooldown |
- Accent = current mode token; trust/safety colours never change with mode.
- Contrast: text ≥ 4.5:1, large text/icons ≥ 3:1 on `bg.base` and `bg.raised` (checked in CI).
- Light theme: follows OS by default (F-17), dark is design reference.

### Type
| Token | Size/line | Weight | Use |
|---|---|---|---|
| `type.display` | 32/38 | 700 | onboarding headlines |
| `type.title` | 22/28 | 700 | screen titles |
| `type.headline` | 17/22 | 600 | card names |
| `type.body` | 15/21 | 400 | text |
| `type.meta` | 13/18 | 500 | distance, time |
| `type.caption` | 11/14 | 600 | badges, chips |
- Family: Inter (bundled, OFL); system fallback. Tabular numerals for counts/distances.
- MUST respect OS Dynamic Type / font scale up to 200 %; layouts reflow, no truncation of actions.

### Space, radius, elevation, motion
- `space`: 2, 4, 8, 12, 16, 20, 24, 32, 48. Screen gutter 16.
- `radius`: sm 8, md 12, lg 20, pill 999. Grid tiles md; sheets lg (top only).
- `elevation`: 0 flat, 1 card, 2 sheet, 3 modal (shadow + `bg` step).
- `motion.fast` 120 ms, `motion.base` 220 ms, `motion.slow` 360 ms; easing `standard` cubic-bezier(0.2,0,0,1). Sheets use spring (damping 20). Reduce Motion ⇒ cross-fade only.
- Touch targets ≥ 44×44 pt.

### Iconography
- 24 px grid, 1.75 px stroke, rounded. Set lives in `/design/icons` (SVG → RN components).
- Badges: verified (trust check), vouched (count), creator, host. Never colour-only: badge = icon + accessible label.

## Components (RN, `/apps/mobile/src/ui`)
Button (primary/secondary/ghost/danger), Chip (toggle, filter, mode), Tile (grid profile), Pin (map: cell, exact, cluster, venue, party), Sheet, ListRow, Toggle, Segmented (Map/Grid, mode switch), Composer, MessageBubble, Badge, Skeleton, EmptyState, ErrorState, OfflineChip, Toast. Each has a story in Storybook with all states from [screens.md](screens.md).

## Copy
### Voice
- Direct, warm, a bit cheeky; never crude in system copy. Sex-positive, no shame, no moralising.
- Say what happens and what is shared: "Visible to verified guys within ~200 m" not "Location on".
- Privacy copy names the data and the audience. No dark patterns: equal weight for yes/no, no confirm-shaming.
- Neutral to identity: "guys", "men" as product audience; never assume pronouns; user-chosen pronouns shown as entered.

### Rules
- R-DS.1 Every string has a key `area.screen.element` (e.g. `explore.map.tray.empty`), lives in `/design/strings/en.json`; no inline strings (lint).
- R-DS.2 Plurals via ICU MessageFormat; never concatenate strings.
- R-DS.3 Push notification strings are generic and content-free (F-16): `push.generic` = "New activity". No names, no counts in Safe Mode.
- R-DS.4 Disguised-icon builds use neutral app name strings from `disguise.*` (I-03 R-I03.5).
- R-DS.5 Error messages: what happened + what to do, ≤ 2 lines, with retry action.

### Key strings (en, reference)
| Key | Text |
|---|---|
| `welcome.headline` | "{count, plural, one {# guy} other {# guys}} around you right now" |
| `welcome.headline.sparse` | "Guys are joining near you" |
| `location.area.desc` | "Shown in a ~200 m zone. Widens automatically if few people are around." |
| `location.exact.desc` | "Your pin, slightly shifted, for {ttl}. Then it disappears." |
| `location.hidden.locked` | "Verify to go Hidden" |
| `location.hideFromHidden` | "Hide me from guys who are hidden" |
| `chat.e2ee` | "End-to-end encrypted. Not even we can read this." |
| `chat.blocked` | "Not delivered" |
| `profile.unavailable` | "Not available" |
| `safety.checkin.due` | "All good?" |
| `push.generic` | "New activity" |

## i18n
- Beta locales: en, fr, de, es, pt-BR, it, nl, pl, tr, ru, ar (RTL), he (RTL), ja, zh-Hans, id, th, hi.
- RTL: layout mirrors via RN `I18nManager`; map controls mirror; numerals per locale.
- Translation: professional + community review (queer-native reviewers per locale); TMS self-hosted (Weblate), EU.
- Locale MUST NOT be sent to server except for push language (stored on device, server sends generic key only; device renders).
- Units: metric default; imperial for en-US/en-GB (miles for distance), user-overridable (F-17).
- Dates/times: device locale + 24/12 h per OS.

## Accessibility
- Every interactive element: accessibilityLabel + role; images: profile photo label = "{name}'s photo {n} of {total}".
- Map has list alternative (grid) reachable in one tap; pins announce distance band, not exact metres.
- Focus order follows visual; sheets trap focus; Escape/back closes.
- Acceptance: AC-DS.1 axe/RN a11y lint zero errors on all S-xx; AC-DS.2 all screens usable at 200 % font; AC-DS.3 VoiceOver/TalkBack complete onboarding unaided (manual).
