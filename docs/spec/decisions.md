# Owner decisions (spec sign-off round 1)

Date: 2026-11-17. Source: [sign-off form](https://claude.ai/artifact/XqFcGc8h7xNGvt7R4gH32n). Binding for beta unless revised here.

| # | Topic | Decision | Applied in |
|---|---|---|---|
| D-01 | App name | **MascHoe is final.** Domain: open. | store listings, bundle IDs |
| D-02 | Legal entity | Switzerland (hosting EU) | #9, security.md |
| D-03 | Hosting | Hetzner (EU regions) | ops.md Infra |
| D-04 | Beta access | Invite-only, ~500 testers, 3 invite codes each | F-01, F-02 |
| D-05 | Seed cities | Zurich, Berlin, Paris (app usable worldwide) | testing.md seed data, go-to-market |
| D-06 | Beta languages | en, fr, de; 14 more at public launch | design-system.md i18n |
| D-07 | Exact pin TTL | 30 min / 1 h / 2 h / 4 h (max 4 h) | F-05 R-05.4 |
| D-08 | Party hosting | Verified only, no account-age minimum | F-10 R-10.1 |
| D-09 | Anti-scrape cap | 300 profile views / hour | security.md A9, F-15 |
| D-10 | Unverified users | Browse + reply only | F-03 R-03.9 |
| D-11 | Pricing | Fully free during beta; Plus after launch | #7 |
| D-12 | Moderation (beta) | Owner only; auto-hide compensating control | F-15 R-15.13, admin-console R-AD.12 |
| D-13 | Age-check fallback | Yoti, zero retention (DPA required) | F-03 R-03.3, I-03 |
| D-14 | Prod deploy approval | Owner only | ops.md |

## Open
- Domain name (D-01).
- Risk accepted by owner: single moderator cannot meet 1 h SLA around the clock; mitigated by auto-hide (R-15.13). Revisit before public beta.
