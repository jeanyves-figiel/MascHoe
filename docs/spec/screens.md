# Screen inventory

Mockups: [canvas](https://claude.ai/artifact/TErsb1tkyu5qWo8JQxD6VG) (board name in brackets). States column: every screen MUST implement loading (skeleton), empty, error (retry), offline (cached + chip) unless marked n/a.

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
| S-10 | Explore map [Home] | F-04 | mode switch, filters, location pill, map, pins, tray | see F-04 table | Safe Mode: counts only |
| S-11 | Explore grid [Main] | F-04 | same header, 3-col grid | scroll, long-press quick actions | sparse → "Further away" section |
| S-12 | Filters sheet | F-04 R-04.8 | per-mode filter groups, reset, apply | apply closes + reloads | — |
| S-20 | Profile (other) [Profile] | F-06 | photos, name, badges, status, tags, sections, private note, linked accounts, actions | swipe photos; Tap; Message; ⋯ menu | blocked/gone → generic "Not available" |
| S-21 | Profile ⋯ menu | F-06, F-15, F-18 | Block, Report, Hide, Vouch, Share profile | each confirms | — |

## Location
| S-30 | Location sheet [Location] | F-05 | 4 levels, Exact TTL/audience, preview, hide-from-hidden toggle | radio, chips, toggle | unverified: Hidden/Exact disabled |

## Tonight & Now
| S-13 | Tonight [Tonight] | F-09 | time slider, featured parties, plan cards, FAB | drag slider; tap card → S-20 | empty → "Be the first tonight" + FAB |
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
| S-40 | Inbox | F-07 | Taps row, New, Chats, Parties & groups | swipe: archive/mute; long-press star | empty → "Say hi to someone nearby" |
| S-41 | Chat [Chat] | F-07, F-08 | header, E2EE line, messages, quick replies, composer (album, location, attach) | send, react, long-press message menu (reply, report, delete for me) | blocked → "Not delivered" |
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
| S-60 | Me [Me] | F-06 | profile switcher, completeness, quick toggles, Preview as, field list | edit field → S-62 | — |
| S-61 | Settings [Settings] | F-17 | search, grouped rows | navigate | — |
| S-62 | Edit field sheet | F-06 | value input, visibility selector | save | validation errors |
| S-63 | Linked accounts | I-01 | list, add, proof steps | verify | proof failed |
| S-64 | Account & data | F-01 | devices, recovery, export, pause, delete | each confirms | — |
| S-65 | Verification status | F-03 | badge date, re-verify | — | expired |
