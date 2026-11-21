# Runbook: Postgres backups & point-in-time restore (SR-01, #141)

## What runs
| | |
|---|---|
| Tool | pgBackRest (from apt.postgresql.org) inside the DB image `registry.fly.io/thirstr-db-<env>:pg16-h3` (`infra/postgres/`) |
| Repo | Tigris bucket `thirstr-backups-<env>` (Fly add-on, primary region `fra`, private), path `/pgbackrest`, stanza `thirstr` |
| Encryption | pgBackRest `aes-256-cbc` with `PGBACKREST_REPO1_CIPHER_PASS` (client-side, before upload). Tigris only ever sees ciphertext. |
| WAL | `archive_mode=on`, `archive_timeout=300` → every change is off the machine within ≤ 5 min (RPO ≤ 5 min; ops.md target 15 min) |
| Base backups | `backup-loop.sh` checks every 10 min: newest backup > 24 h old → take one; full if newest full > 7 d, else differential |
| Retention | 5 fulls (≈ 5 weeks of point-in-time restore; ops.md asks ≥ 30 d). Old WAL is expired with them. |
| Also | Fly volume snapshots (daily, 5 d, same host provider) stay on as a second layer |

Off when `PGBACKREST_REPO1_S3_BUCKET` is unset (DEV compose, CI) or the machine has env `BACKUPS=off` (restore drills).

## Secrets (Fly app secrets on `thirstr-db-<env>`, never in git)
`PGBACKREST_REPO1_S3_BUCKET`, `PGBACKREST_REPO1_S3_KEY`, `PGBACKREST_REPO1_S3_KEY_SECRET`, `PGBACKREST_REPO1_CIPHER_PASS`.

**The cipher pass is the only way to read the backups.** Keep a copy outside Fly (owner password manager), see #158. Without it a backup is useless.

## Check
```sh
# status lines from the loop
fly logs -a thirstr-db-<env> | grep backup-loop
# backups, WAL range, sizes
fly ssh console -a thirstr-db-<env> -C "gosu postgres pgbackrest info"
# archive works end to end
fly ssh console -a thirstr-db-<env> -C "gosu postgres pgbackrest check"
```
(Without flyctl: Machines API `POST /v1/apps/<app>/machines/<id>/exec` with the same commands.)

## Restore to a point in time (drill or real)
Never restore over the running prod volume. Restore into a new machine + volume, check, then switch `DATABASE_URL`.

1. Create a volume (same size or larger) in `fra` on `thirstr-db-<env>`.
2. Create a machine from the same image digest with that volume at `/var/lib/postgresql/data`, the app secrets, `PGDATA=/var/lib/postgresql/data/pgdata`, and init `["sleep","inf"]` (so Postgres doesn't start yet).
3. Exec on it:
   ```sh
   export PGBACKREST_STANZA=thirstr PGBACKREST_PG1_PATH=$PGDATA PGBACKREST_REPO1_TYPE=s3 \
     PGBACKREST_REPO1_PATH=/pgbackrest PGBACKREST_REPO1_S3_ENDPOINT=fly.storage.tigris.dev \
     PGBACKREST_REPO1_S3_REGION=auto PGBACKREST_REPO1_CIPHER_TYPE=aes-256-cbc
   mkdir -p $PGDATA && chown postgres $PGDATA && chmod 700 $PGDATA
   gosu postgres pgbackrest restore --type=time --target="2026-11-21 09:00:00+00" --target-action=promote
   ```
   (Latest point: omit `--type/--target`.)
4. Start Postgres on it: update the machine without the sleep init. Drill: add env `BACKUPS=off` so the copy never archives into the live repo (app secrets reach every machine of the app).
5. Check: `SELECT count(*) FROM accounts; SELECT max(created_at) FROM mls_messages;`
6. Real incident: stop `thirstr-api-<env>`, point `DATABASE_URL` at the new machine (`<id>.vm.thirstr-db-<env>.internal`), start the API, then make the new machine the only DB machine.

## Drill log
| Date | Env | Target | Result | Time to usable DB |
|---|---|---|---|---|
