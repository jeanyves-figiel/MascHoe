# Runbook: transactional email (sign-in links, #26)

Only email Thirstr sends: magic sign-in links (F-01 R-01.3) and the "add sign-in email" link (RF-7). Plain text, no tracking pixels, no link rewriting. The address is used once and forgotten (only a peppered hash is kept).

| What | Value |
| --- | --- |
| DEV | Mailpit (`docker compose`, UI https://localhost:7443 › mail) |
| Staging / prod | **Brevo** (France, free 300/day, DPA; owner's pick 2026-11-21) relay `smtp-relay.brevo.com:587`, STARTTLS, certificate + hostname verified |
| Sender | `MAIL_FROM` (default `hello@thirstr.fun`) |
| Off switch | no `SMTP_HOST` → email sign-in is not delivered on that env (Apple, Google, passkeys still work) |

## Brevo specifics
- Account: owner's. Settings › Senders, domains › add `thirstr.fun` → Brevo shows a `brevo-code` TXT and two DKIM CNAMEs (`brevo1._domainkey`, `brevo2._domainkey`); add them in GoDaddy DNS and click Authenticate.
- SPF include: `include:spf.brevo.com`.
- Transactional › Settings: turn **off** open and click tracking.
- SMTP & API › SMTP: login (`…@smtp-brevo.com`) and an SMTP key (one key per env, named `thirstr-staging` / `thirstr-prod`).

## Setup (per env)
1. Owner creates the provider account, signs its DPA, turns **off** open/click tracking.
2. Authenticate `thirstr.fun` at the provider; add its DKIM records in GoDaddy DNS and its include to SPF:
   `v=spf1 include:spf.improvmx.com include:<provider SPF> ~all` (one SPF record only). Add DMARC: `_dmarc` TXT `v=DMARC1; p=quarantine; rua=mailto:hello@thirstr.fun`.
3. Set secrets (never in git):
   ```sh
   fly secrets set -a thirstr-api-<env> SMTP_HOST=<relay> SMTP_PORT=587 SMTP_USER=<user> SMTP_PASSWORD=<key>
   ```
4. Check: request a link from the app on that env; it arrives from `hello@thirstr.fun`, passes SPF/DKIM/DMARC ("Show original" in Gmail).
