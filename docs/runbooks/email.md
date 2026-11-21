# Runbook: transactional email (sign-in links, #26)

Only email Thirstr sends: magic sign-in links (F-01 R-01.3) and the "add sign-in email" link (RF-7). Plain text, no tracking pixels, no link rewriting. The address is used once and forgotten (only a peppered hash is kept).

| What | Value |
| --- | --- |
| DEV | Mailpit (`docker compose`, UI https://localhost:7443 › mail) |
| Staging / prod | **Amazon SES**, EU region `eu-central-2` (Zurich) or `eu-central-1` (Frankfurt), same AWS account as the owner's other app (owner's pick 2026-11-21, replaces Brevo). SMTP `email-smtp.<region>.amazonaws.com:587`, STARTTLS, certificate + hostname verified. AWS DPA (GDPR) applies |
| Sender | `MAIL_FROM` (default `hello@thirstr.fun`) |
| Off switch | no `SMTP_HOST` → email sign-in is not delivered on that env (Apple, Google, passkeys still work) |

## Amazon SES specifics
- SES › Identities › Create identity › Domain `thirstr.fun`, Easy DKIM RSA 2048: add the 3 `…._domainkey` CNAMEs in GoDaddy DNS.
- Custom MAIL FROM `bounce.thirstr.fun`: MX `10 feedback-smtp.<region>.amazonses.com` + TXT `v=spf1 include:amazonses.com ~all` (on `bounce`, so the apex SPF stays ImprovMX only).
- Account must be out of the SES sandbox in that region (Account dashboard › Request production access) or it only sends to verified addresses.
- Configuration set without open/click tracking (none by default).
- SMTP settings › Create SMTP credentials (IAM user `thirstr-ses-smtp-<env>`, policy `ses:SendRawEmail` only, condition `ses:FromAddress = hello@thirstr.fun`).

## Setup (per env)
1. Owner's AWS account (GDPR DPA is part of the AWS service terms).
2. Authenticate `thirstr.fun` (records above). Add DMARC: `_dmarc` TXT `v=DMARC1; p=quarantine; rua=mailto:hello@thirstr.fun`.
3. Set secrets (never in git):
   ```sh
   fly secrets set -a thirstr-api-<env> SMTP_HOST=<relay> SMTP_PORT=587 SMTP_USER=<user> SMTP_PASSWORD=<key>
   ```
4. Check: request a link from the app on that env; it arrives from `hello@thirstr.fun`, passes SPF/DKIM/DMARC ("Show original" in Gmail).
