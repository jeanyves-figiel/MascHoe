# F-14 Safe Mode

## Trigger
- R-14.1 Country from device cell r5 → bundled ILGA criminalization list (offline, updated with app). Also IP country at Welcome.
- R-14.2 Setting: Auto (default) / Always on / Off. Turning Off in a listed country needs a second explicit warning.

## Protections when on
| Protection | Behaviour |
|---|---|
| Location | Default City; Exact disabled (override = second warning); map shows counts only |
| Visibility | Visible to verified users only; new accounts (< 7 d) can't see you |
| App lock | Forced on |
| Icon | Prompt to switch to disguised icon (Notes/Calculator/Weather) |
| Notifications | No previews, generic title "Reminder" |
| Media | Received media auto-delete after viewing; save disabled |
| Duress PIN | Offered at activation |
| Parties/venues | Creation and check-in disabled |
| Entrapment warnings | Banner on chats with accounts < 30 d, unverified, or pushing to meet quickly (heuristic: meet request within 5 messages) |
| Resources | Offline list of local NGOs/hotlines per country |
| Onboarding | F-02 R-02.10 variant |

## Rules
- R-14.3 No server-side list of users in a country is ever produced; detection is client-side.
- R-14.4 Leaving the country: prompt to restore previous settings.
- R-14.5 Moderation coverage: reports from Safe Mode countries prioritized (SLA 1 h).

## Acceptance criteria
- AC-14.1 With Safe Mode on, no Exact pin can be set without passing the second warning.
- AC-14.2 Push payload titles in Safe Mode are generic.
