# F-18 Vouches & trust badges

## Badges (system-set)
| Badge | Rule |
|---|---|
| Verified | F-03 credential valid; shows month/year |
| Member since | account created month/year (shown as "2 yrs") |
| Vouches N | count of active vouches |
| Replies fast | reply rate bucket ≥ 60 % within 1 h over last 30 d |
| Host rating | ≥ 3 party ratings; shows 👍 % |

## Vouches
- R-18.1 Only verified accounts ≥ 30 d old can vouch; only for profiles they chatted with (≥ 10 messages both ways) — proxy for having met.
- R-18.2 Max 5 vouches given per 30 d; max counted vouches displayed 20.
- R-18.3 Vouches decay: weight 1.0 for 6 months, then linear to 0 at 12 months.
- R-18.4 Vouches between the same pair count once; reciprocal vouch rings detected (graph clustering) → discounted.
- R-18.5 Vouch is anonymous to the receiver (count only); can be withdrawn.
- R-18.6 Vouches never affect sorting in Explore (anti pay-to-win/popularity) — shown only on profile and party requests.

## Acceptance criteria
- AC-18.1 Account < 30 d gets 403 on vouch.
- AC-18.2 Explore ordering unchanged by vouch count (test).
