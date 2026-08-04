# Backup and restore

Real sales and GST invoices live in this database. This is the procedure that
gets them back.

## Taking a backup

```bash
DIRECT_URL="postgresql://…" ./scripts/backup.sh
```

Writes a timestamped, compressed dump to `./backups` and prunes anything older
than 30 days (`BACKUP_KEEP_DAYS` to change). `backups/` is gitignored — the
dumps contain customer data and must never be committed.

**Use the owner connection (`DIRECT_URL`), not the app role.** The app role
cannot read past row-level security, so a dump taken with it comes back nearly
empty. The script warns if the file looks suspiciously small, but the warning is
a safety net, not a substitute for using the right credentials.

Schedule it however you like — cron, Task Scheduler, a GitHub Action. What
matters is that it runs somewhere that is not the same machine as the database.

## Restoring

```bash
RESTORE_URL="postgresql://…/scratch_db" ./scripts/restore.sh backups/salonos-20260804-091133.dump
```

`RESTORE_URL` is deliberately a different variable from `DIRECT_URL`: restoring
overwrites the target, so it must never default to whatever database you happen
to have configured. The script also asks you to retype the hostname before it
touches anything.

Afterwards it counts the restored tables and rows and fails loudly if the target
came back nearly empty. Then recreate the app role, which is not part of the
dump:

```bash
psql "$RESTORE_URL" -f scripts/provision-app-role.sql
```

## The drill

Rehearse this against a throwaway database. An untested backup is a guess.

The rehearsal below was run on 2026-08-04 against the local dev database and
passed: **23 tables, 44 sales — matching the source exactly.**

```bash
# 1. Scratch database to restore into
docker exec salonos-postgres psql -U salonos -d postgres -c "CREATE DATABASE restore_drill;"

# 2. Back up the real one
DIRECT_URL="postgresql://salonos:PASSWORD@localhost:5432/salonos" ./scripts/backup.sh

# 3. Restore into the scratch copy and confirm the counts match
RESTORE_URL="postgresql://salonos:PASSWORD@localhost:5432/restore_drill" \
  ./scripts/restore.sh backups/salonos-*.dump

# 4. Clean up
docker exec salonos-postgres psql -U salonos -d postgres -c "DROP DATABASE restore_drill;"
```

If `pg_dump` is not installed on the host, run the scripts inside the Postgres
image instead — it ships the client tools:

```bash
docker run --rm -i --network "container:salonos-postgres" -v "$(pwd):/work" -w /work \
  -e DIRECT_URL="postgresql://salonos:PASSWORD@localhost:5432/salonos" \
  postgres:16 bash scripts/backup.sh ./backups
```

### What the drill caught

The first rehearsal failed in the most dangerous way possible. `restore.sh`
passed `--exit-on-error=0` to `pg_restore`, which takes no argument, so the
restore never ran — and a trailing `|| true` swallowed the error, leaving the
script to print "Restore finished." A backup that reports success while
restoring nothing is worse than no backup at all, because you stop worrying
about it.

That is the entire argument for rehearsing: the bug was invisible in code review
and obvious the moment it ran. `restore.sh` now verifies by counting rows and
exits non-zero if the target came back empty.

## Checking a live deployment

`GET /api/health` reports whether the safeguards are actually on — database
reachability, whether the rate limiter is shared or per-instance, whether error
reporting and email are configured. It needs no authentication and returns 503
when the database is unreachable, so an uptime monitor can watch it directly.

Two things worth watching there:

- `rateLimiter.shared: false` means brute-force limits do not hold across
  instances. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
- `email.usingSharedSender: true` means password-reset mail only reaches the
  Resend account owner. Verify a domain before relying on it.
