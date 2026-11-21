# Screen inventory

Mockups: [canvas](https://claude.ai/artifact/TErsb1tkyu5qWo8JQxD6VG) (board name in brackets). States column: every screen MUST implement loading (skeleton), empty, error (retry), offline (cached + chip) unless marked n/a.

## App v2 visual standard (issue 58)
Mockup (approved 2026-11-17): [app v2 canvas](https://claude.ai/artifact/3uHEiz4DBoGmuXPQfnyxif). Board names in brackets below now refer to that canvas where they say "v2". Every main screen follows design-system.md › App v2 rules: 34 pt display titles on tab roots, pill controls, icon + label nav, scrims on photos, no text glyphs as icons (☰, ✓, ✕ replaced by `src/ui/icons.tsx`).

## Sub-screen standard (issue 63)
Mockups in the same canvas, second row: Edit profile, Settings, Party, Host a party, Venue check-in, Private albums, Safety, Report, Taps. Activity and Club follow Party; Album, Blocked, Devices, Notices, App lock and Check-in follow Settings/Safety. Rules: design-system.md › Sub-screen rules. Albums list = 2-column cover cards with Private pill plus a dashed "Create album" tile (name asked in a sheet). Taps = cards with a sunflower star badge; button Tap back → Message once mutual. Safety = SOS hold card first, then check-in, trusted contacts card (initial avatar, resend, remove), app lock, resources.

## Navigation
Tab bar (4): **Explore** S-10 · **Tonight** S-13 · **Chats** S-40 · **Me** S-60. Modal sheets slide up; profiles open as sheet over map, full screen elsewhere. Back = swipe/edge.

## Onboarding & auth
| ID | Screen [board] | Spec | Key elements | Interactions | Special states |
|---|---|---|---|---|---|
| S-01 | Welcome [v2 Main] | F-02 | wordmark 52 pt, drifting blurred activity blobs, "Live around {area}" chip, headline count, 3 promises with teal icons, Get started, I already have an account | CTA → S-02 | count < 10 → "Guys are joining near you" |
| S-02 | Sign up [v2 Sign up] | F-01 | wordmark, "Let's get you in.", Apple / passkey / Google / email link, 18+ consent line | method → auth sheet | login copy "Welcome back."; email path → S-02b "Check your inbox" |
| S-03a | Name [v2 Name] | F-02 | question headline, big input, n/30 | Continue when 1–30 chars | — |
| S-03b | Birthday [v2 Birthday] | F-02 | 3-column wheel, age chip | snap + haptic | under 18 → S-03x block |
| S-03c | I am [v2 I am] | F-02 | 4 pill options, free-text for Something else | auto-advance | — |
| S-03d | Here for [v2 Here for] | F-02 | 5 colour tiles | multi-select; Continue saves basics | none selected → CTA disabled |
| S-04 | Location setup [v2 Location] | F-05 | live map preview, 4 options, privacy footer, Allow location | option changes preview; CTA → OS prompt | denied → city picker S-04b |
| S-05 | Main photo [v2 Main photo] | F-02, F-15 | 4:5 frame, 4 extra slots, status line | camera/library; scan while checking | rejected → reason + tips |
| S-06 | Verify [v2 Get verified] | F-03 | payoff intro, face oval, ring, prompt, pips, Later | auto-advance challenges | fail → retry/cooldown S-06b |
| S-07 | You're in [v2 You're in] | F-02 | profile card preview, See who's around | → S-10 | — |

## Explore
| S-10 | Explore [blend mockup A, #100; live header #104] | F-04 | live header R-04.17 (wordmark, filters with badge, own avatar/Now; place name + level chip + live counts; mode tiles with counts), map, pins, grid sheet (peek/half/full, R-04.14), Locate me + zoom chip above sheet | see F-04 table | Safe Mode: counts only; quiet area / unverified states R-04.16 |
| S-11 | Explore grid = S-10 sheet in full state (#100) | F-04 | same header, "Active now · N" title, 3-col tiles (radius 18, bottom scrim, Now badge, online dot, verified tick) | scroll, long-press quick actions | sparse → "Further away" section |
| S-12 | Filters sheet | F-04 R-04.8 | per-mode filter groups, reset, apply | apply closes + reloads | — |
| S-20 | Profile (other) [v2 Profile] | F-06 | full-bleed photo (520 pt) with pager bars, white round back + ⋯, name 34 pt + verified, chips (distance teal, Online, Now, vouches), about, tags, private note (sunflower card), album row (violet "Ask to unlock"), sticky Tap (flame, coral when sent) + favorite star (sunflower when on, private) + Message (coral), sections, linked accounts | swipe photos; Tap; Message; ⋯ menu | blocked/gone → generic "Not available" |
| S-21 | Safety sheet [#111, [mockup](https://claude.ai/artifact/BcXqbMNne1uWyakLqfC67c) A] | F-15, F-06, F-04, F-07, F-18 | title name, age; optional photo + distance; context rows (Explore: Open profile, Tap, Message · chat: View profile, Favorite, Add / remove friend, Private note, Check-in (#115)); three tiles **Hide · Block · Report** (40 pt tinted icon, label, one-line consequence); rows below (profile: Share, Vouch · inbox: Favorite (Pin for groups), Mute, Archive, Delete · chat settings); footnote never-told + Settings link. Opened from profile ⋯, map peek ⋯, grid long-press, chat ⋯, inbox long-press | Hide → toast + Undo; Block → inline confirm (3 points, red Block, Cancel); Report → S-50 | error banner in sheet |

## Location
| S-30 | Location sheet [Location] | F-05 | 4 levels, Exact TTL/audience, preview, hide-from-hidden toggle | radio, chips, toggle | unverified: Hidden/Exact disabled |

## Tonight & Now
| S-13 | Tonight [v2 Tonight] | F-09 | city · day caption, 34 pt title, time window chips, featured party card (art, spots badge, Request), plan rows (avatar ring in mode colour, Message), white "Post a plan" FAB | drag slider; tap card → S-20 | empty → "Be the first tonight" + FAB |
| S-13b | Post plan sheet | F-09 R-09.9 | window, text, tag, audience | post | limit reached → message |
| S-18 | Now sheet | F-09 | status options, text, TTL | set/end | — |

## Parties
| S-14 | Party detail [Party] | F-10 | header, seats, rules, requests (host) / status (guest), Guest chat, Send address | accept/decline; request; leave | full / ended / cancelled |
| S-15 | Create party sheet | F-10 R-10.1 | fields | create | account < 7 d → disabled with reason |

## Activities
| S-16 | Sport feed [Activities] | F-11 | sport chips, posts, clubs carousel | join/leave; open club | no posts → "Start one" |
| S-16b | Create activity post | F-11 R-11.3 | fields | post | — |
| S-19 | Club page | F-11 R-11.6 | header, events, members count, join | join/request | pending |

## Venues
| S-17 | Venue here-now [Venue] | F-12 | stats, here grid, visibility toggle, check out | tap profile; go invisible | not checked in → venue info + Check in |

## Chats & media
| S-40 | Inbox [v2 Chats, #115] | F-07 | 34 pt title, search (names, messages, own notes/tags, R-07.34), segmented All / Unread / Favorites / Friends (R-07.33), favorites strip (All), Taps row (flame), rows (56 pt avatar, online dot, sunflower star = favorite, violet Friend badge, note line, bold preview + coral count when unread), Friends: requests row + Online / Friends sections, Parties & groups, E2EE footer (teal) | swipe: archive/mute; long-press favorite / pin (groups) | empty → "Say hi to someone nearby" |
| S-41 | Chat [v2 Chat] | F-07, F-08 | header (back, avatar, name, Friend badge, distance · status, favorite star button, ⋯, sunflower timer chip), private note strip (R-07.35), friend request / accepted cards (R-07.36), E2EE pill (teal tint), bubbles (own = mode colour, incoming `bg.overlay`, 22 radius with 6 pt tail), typing, quick-reply chips, pill composer (+, field, coral send). Translation [#106, R-07.28–29]: caption under translated bubbles (teal translate icon, "Translated from X · Show original"), expanded original, "Translate X" chip when a pack is missing, teal note under the E2EE pill; chat ⋯ "Translate this chat" switch ; search mode (R-07.39, #121): search header, marked matches, "N of M" bar with up/down | send, react, show original, translate, long-press message menu (reply, report, delete for me) | blocked → "Not delivered" |
| S-42 | Albums | F-08 | album grid, shared-with | grant/revoke | — |
| S-43 | Media viewer | F-08 | full-screen, view-once timer, blur overlay | tap to reveal; close | screenshot notice |
| S-44 | Share target (extension) | I-01 | preview, recipients, message | send | not logged in → open app |

## Safety
| S-50 | Report flow | F-15 | reasons, attach messages, note | submit → block offer | — |
| S-51 | Check-in start sheet | F-13 | due time, options, contacts | start | no contacts → add contact first |
| S-52 | Check-in due | F-13 | "All good?", I'm OK, +30 min | biometrics | duress path |
| S-53 | Trusted contacts | F-13 | list, add, invite | add/remove | — |
| S-54 | Safe Mode intro [SafeMode] | F-14 | protections list, Keep me safe | toggles | — |
| S-55 | App lock / decoy | F-13 | PIN pad | unlock / duress | — |

## Me & settings
| S-60 | Me [v3 Me, #102] | F-06, F-05, F-09 | Header: 34 pt "Me", QR + gear (→ S-61) buttons. **One banner slot** (highest only: suspended > unseen notices > verify > sign-in email nudge > paused). Profile card: completeness ring, name/age/tick, "Profile N% complete", next-step link, Edit profile (white) / Preview. **How you show up right now** (teal label, card): Location segmented Hidden / City / Area / Exact with "Others see" caption (one tap applies Hidden/City/Area; Exact opens S-30 for TTL, audience, confirm; Hidden/Exact disabled until verified → S-21), Incognito switch, Now row (value → Now sheet). **Show me in**: 3 lens tiles (mode colour border + check, caption of what shows; ≥1 stays on, R-06.1a) + "See how you look" link → S-66. **Yours**: Private albums (count), Date check-in (contacts count) | lens toggle, location level | locked level → verify ([mockup](https://claude.ai/artifact/ARHgwzBiimAcTigGa2AA59)) |
| S-61 | Settings hub [v3, #102] | F-17 | back "Me", 34 pt title, search (filters rows across all categories, R-17.4), card of 5 categories each with colour icon tile + live summary of current values: Privacy & visibility (teal) → S-67, Chats & media (violet) → S-68, Notifications (coral) → S-69, Safety (lime) → S-70, Account (sunflower) → S-64. **App** inline: Distance units segmented, Haptics, Language (→ OS settings). **About**: Privacy policy, Open-source licences, Version. Outline "Log out" button last | navigate | — |
| S-62 | Edit field sheet | F-06 | value input, visibility selector | save | validation errors |
| S-63 | Linked accounts | I-01 | list, add, proof steps | verify | proof failed |
| S-64 | Account [v3, #102] | F-01, F-17 | **Sign-in**: sign-in email (Added / Add → sheet), Devices (count). **Your data**: Download my data. **Take a break or leave**: Pause / Resume account, Log out everywhere, Delete account (red → confirm screen: type DELETE + biometrics, R-17.8) | each confirms | — |
| S-65 | Verification status | F-03 | badge date, re-verify | — | expired |
| S-66 | How others see you [v4, #114] | F-06 | Title "How others see you". **They’re browsing**: 3 lens tiles (mode colour; selected = filled; caption "You’re in" / "You’re off", off lens dashed). **They are**: segmented New guy / Verified / In chats. Lens off → dashed card "You don’t show up in X" + "Show me in X" (adds lens to `show_in`). Else tabs **On the map** (stylised map, own photo in a ring split by every lens in `show_in`, R-04 map rings; zone circle ~200 m for Area, large for City, none for Exact; Hidden/incognito → "You’re Hidden: nobody sees you on the map"), **In the grid** (3×3, own tile centre with lens-colour border, "You" tag), **Profile** (main photo, photo dots for lens photos, chips coloured by visibility: lens colour public, teal verified, yellow chats; "Open full screen" → S-20 preview). Below: **What ‹viewer› doesn’t see** (R-06.7a), one row per reason with Change (fields/photos → S-62 Edit, albums → Albums) | lens, viewer, surface, Change | lens off; Hidden ([mockup](https://claude.ai/artifact/6z5f8akgDAs4bYYgapXaH7)) |
| S-67 | Privacy & visibility [v3, #102] | F-17, F-05 | Location row (value, → S-30). **Who can see you**: Hide from unverified, Hide from new accounts (< 7 d), Hide from hidden users (R-05.6), Ages who can see me (range slider). **Appear on** chips: Grid, Map, Tonight, Activities, Venues (off = absent there only). **What others see**: Distance on your profile Exact / Range / Off + caption, Online status (symmetric, R-17.5) | toggle | — |
| S-68 | Chats & media [v3, #102] | F-17, F-07, F-08 | **Who can message me** radio list (R-17.6). **Media**: Explicit photos from strangers Blur / Show / Block, Delete received photos after viewing. **Messages**: New chats disappear after 24 h / 7 days / Never, Read receipts & typing, Quick replies (count → sheet with 3 fields). **Translation** [#106]: Translate messages Automatic / Tap / Off (into the phone's language) + teal privacy note "Done on this phone…" (R-07.27) | toggle | — |
| S-69 | Notifications [v3, #102] | F-16 | privacy note (lock screen says "New activity"), iOS "Allow notifications" when not granted, groups: **Chats** (messages, taps, mutual), **Plans** (parties: requests + accepted + address as one switch, Tonight matches, Activities & clubs, Venue taps), **Account** (verification). Moderation notices always on. **Quiet hours** switch + From / Until time pickers | toggle | — |
| S-70 | Safety settings [v3, #102] | F-14, F-13, F-03, F-15 | Safe Mode Auto / Always on / Off (Off asks inline: Keep it / Turn off) + caption. App lock & duress PIN (→ S-55), Verification (date, Verify again → S-21), Hidden & blocked (count → S-71), Notices from Thirstr. Footnote: date check-in lives on Me | toggle | — |
| S-71 | Hidden & blocked [#111] | F-15 | 34 pt title, segmented Hidden · N / Blocked · N, explanation card, rows (photo 46, name, age, ago) with Unhide / Unblock pill | tap pill → toast | empty: Nobody hidden/blocked + how-to |
