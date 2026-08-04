#!/usr/bin/env bash
#
# Restores a dump taken by scripts/backup.sh.
#
# Rehearse this against a THROWAWAY database before you ever need it for real —
# that rehearsal is the only thing that turns a backup file into a backup.
#
#   RESTORE_URL="postgresql://…/scratch_db" ./scripts/restore.sh backups/salonos-*.dump
#
# Deliberately uses RESTORE_URL rather than DIRECT_URL: restoring is destructive
# and must never default to the database you happen to have configured.
#
# After restoring, the row-level-security policies come back with the schema,
# but remember the app role must exist in the target too:
#   psql "$RESTORE_URL" -f scripts/provision-app-role.sql

set -euo pipefail

FILE="${1:-}"
URL="${RESTORE_URL:-}"

if [ -z "$URL" ] || [ -z "$FILE" ]; then
  echo "Usage: RESTORE_URL='postgresql://…' $0 <dumpfile>" >&2
  echo "RESTORE_URL must be set explicitly — this overwrites the target database." >&2
  exit 1
fi
if [ ! -f "$FILE" ]; then
  echo "No such dump: $FILE" >&2
  exit 1
fi
if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore not found. Install the PostgreSQL client tools (v16+)." >&2
  exit 1
fi

# Guard against the classic 3am mistake.
HOST=$(printf '%s' "$URL" | sed -E 's#.*@([^/:]+).*#\1#')
echo "About to REPLACE the contents of the database at: $HOST"
read -r -p "Type the host again to confirm: " CONFIRM
if [ "$CONFIRM" != "$HOST" ]; then
  echo "Aborted — nothing was changed."
  exit 1
fi

echo "Restoring $FILE …"
# --clean --if-exists drops existing objects first so the restore is a true
# replacement rather than a merge. pg_restore's default is to continue past
# individual object errors, which is what we want: a DROP of something that was
# never there is noise, not failure. We still capture the exit code — an early
# version swallowed it with `|| true` and cheerfully reported success after
# restoring nothing at all.
set +e
pg_restore --dbname="$URL" --clean --if-exists --no-owner --no-privileges "$FILE"
RC=$?
set -e

echo
# Verify by counting actual rows rather than trusting the exit code. A restore
# can partially succeed, and "it didn't error" is not the same as "the data is
# there" — that gap is the whole reason to rehearse this.
TABLES=$(psql "$URL" -tAc \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null || echo 0)
SALES=$(psql "$URL" -tAc 'SELECT COUNT(*) FROM "Sale";' 2>/dev/null || echo "n/a")

echo "Tables restored: $TABLES"
echo "Rows in Sale:    $SALES"

if [ "$TABLES" -lt 5 ]; then
  echo "FAILED — the target has almost no tables. The restore did not work." >&2
  exit 1
fi
if [ "$RC" -ne 0 ]; then
  echo "Restore reported errors (exit $RC) but data is present — check the log above." >&2
fi

echo
echo "Restore verified. One more step before the app can use this database:"
echo "  psql \"\$RESTORE_URL\" -f scripts/provision-app-role.sql   # recreate the app role"
