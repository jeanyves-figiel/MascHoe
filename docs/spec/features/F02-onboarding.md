# F-02 Onboarding

## Purpose
Install → seeing who's around in < 60 s; visible + messaging in < 2 min.

## Flow (screens S-01…S-06)
| Step | Screen | Required | Skippable | Exit |
|---|---|---|---|---|
| 0 | S-01 Welcome | — | — | Get started → S-02; I have an account → login |
| 1 | S-02 Create account | method + 18+ checkbox | no | → S-03 |
| 2 | S-03 Basics | name, birthday (≥ 18), "I am" | "Here for" defaults Hookup+Tonight | → S-04 |
| 3 | S-04 Location | OS permission prompt | user can deny → City level via manual city pick | → S-05 |
| 4 | S-05 Main photo | 1 photo passing main-photo check | no (needed to appear); can browse after "Later" on S-06 | → S-06 |
| 5 | S-06 Verify | — | "Later" → browse-only | → S-10 Explore |

## Rules
- R-02.1 One question per screen; progress bar of 5 segments (S-02…S-06).
- R-02.2 Welcome shows live blurred activity: server returns counts per r7 cell around an **approximate** IP-geolocated city (no permission needed); text "N guys around you. Right now." N rounded down to nearest 10 if < 100.
- R-02.3 Birthday under 18 → stop: "You need to be 18+". Account deleted, device flagged 30 d.
- R-02.4 "I am": Man · Trans man · Non-binary · Other (free text 20). Required.
- R-02.5 "Here for": multi-select Hookup, Tonight, Chat, Friends, Sport. Pre-selected Hookup + Tonight. Sets default Explore mode and creates Sport/Friends profiles lazily when first used.
- R-02.6 Location step explains before OS prompt. Default level Area (~200 m). Hidden option disabled with label "After you verify".
- R-02.7 Main photo: camera or library; on-device pre-check then server classifier (F-15 R-15.10). Result inline < 3 s: ok / "needs to be less explicit for your main photo" / "we need to see a person". 4 extra slots offered, skippable.
- R-02.8 Verify "Later": user lands on Explore browse-only; banner "Verify to be seen and message first" persistent until done.
- R-02.9 Push permission is **not** asked in onboarding; asked on first incoming message/tap.
- R-02.10 Safe Mode country detected (F-14) → flow becomes: Welcome (neutral copy) → Create account → **App lock + disguised icon** → Basics → Location (City default, Exact disabled) → Photo → Verify (mandatory before visible).
- R-02.11 Coach mark on first Explore: one bubble "Tap a pin or swipe the cards", dismissed on first interaction.
- R-02.12 Progressive profiling triggers: first Now post → position/hosting; first Sport mode → sport fields; 3rd chat → health "share privately" offer; profile completeness nudge max 1/day.

## Edge cases
- App killed mid-onboarding → resume at last incomplete step.
- Location denied → City picker (search city), level City; can upgrade later.
- Photo rejected 3× → tips sheet + manual review option (24 h).

## Acceptance criteria
- AC-02.1 Median time install→Explore ≤ 60 s in usability test (n=10).
- AC-02.2 No push permission prompt before first inbound event.
- AC-02.3 Under-18 birthday blocks account creation.
- AC-02.4 Safe Mode variant shows app lock step before Basics.
