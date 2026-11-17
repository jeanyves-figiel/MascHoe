# F-15 Moderation & anti-bot

## Anti-bot gate
- R-15.1 Verification required to be visible and to initiate (F-03).
- R-15.2 Device attestation on every session; emulator/rooted/jailbroken without attestation → read-only.
- R-15.3 Max 1 active account per verified human; max 3 profiles.
- R-15.4 Rate limits (api.md). New accounts (< 7 d): halved limits.
- R-15.5 Signals (metadata only): identical first-message hash across ≥ 5 recipients (client sends salted hash of first message, not content), link attempts in first messages, reply ratio < 5 % over 50 sends, 24/7 activity, location velocity, cell-hopping, copy-paste bios (server-side similarity on public bios).
- R-15.6 Score ≥ threshold → **shadow quarantine**: user sees normal UI, outbound taps/messages/visibility delivered to nobody. Review within 24 h.
- R-15.7 Community: "Bot / scam" one-tap report; 3 reports from distinct verified accounts with good reporter score in 24 h → immediate quarantine pending review.
- R-15.8 Creator profile type: accounts promoting paid content must self-declare; undeclared promotion → warning then quarantine. Creators hidden by default in filters.

## Content moderation
- R-15.9 Report flow (S-50): reason (spam/bot, scam/extortion, underage, harassment, non-consensual content, hate, impersonation, other) + optional franked messages/media + note. Block offered automatically.
- R-15.10 Public photo classifier (self-hosted): labels nudity levels; main photo must be "clothed/shirtless"; slots 1–4 allow underwear/suggestive, reject genitals/sex acts; Sport profile strict. Borderline → human queue (SLA 12 h).
- R-15.11 Hash matching (CSAM list) on all public photos; positive → account banned + legal reporting.
- R-15.12 Bio/text: discriminatory phrases → write-time nudge; post-publish flag → hide field + warning.
- R-15.13 Human moderators: closed beta = owner only, EN/FR/DE. Public launch: regional coverage (EN, FR, DE, ES, PT, IT, AR, RU, TR). SLAs: underage/CSAM/violence 1 h, extortion 4 h, others 24 h. Beta compensating control: content auto-hidden on classifier match or ≥ 2 independent reports for severe reasons until reviewed.
- R-15.14 Actions: warn, hide field/photo, quarantine, suspend (1–30 d), ban (account + LSH face bucket, F-03 R-03.6). Every action has reason code + appeal (in-app, 1 appeal, reviewed by different moderator ≤ 72 h).
- R-15.15 Moderator tool: sees only reported content + public profile + metadata signals; no access to chats beyond franked reported messages; all access logged.
- R-15.16 Transparency report quarterly: reports by category, actions, bot-rate per 1k MAU, government requests.

## Acceptance criteria
- AC-15.1 Quarantined account receives HTTP 200 on sends; recipients receive nothing.
- AC-15.2 Moderator UI cannot open a chat that wasn't reported (permission test).
- AC-15.3 Bot-rate KPI computed daily.
