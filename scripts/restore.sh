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
# Prove the target now HOLDS THE DUMP'S DATA — not merely that tables exist.
#
# Counting tables was the previous check and it was worthless: the tables were
# already there, so a restore that dropped nothing and loaded nothing still
# passed. That happened twice. `pg_restore --clean` cannot drop objects it
# lacks rights over, or that other objects depend on, and it continues past
# those errors by design — so a target left completely untouched is a real
# outcome that must be caught here.
#
# The dump's own table-of-contents gives the expected row counts, so compare
# against that rather than against a guess.
EXPECTED=$(pg_restore -l "$FILE" | grep -cE "TABLE DATA" || echo 0)
ACTUAL=$(psql "$URL" -tAc \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | tr -d ' ' || echo 0)

# A row fingerprint across the biggest tables. If the restore was a no-op these
# match what was there BEFORE, which is why the caller is shown both and the
# script refuses to claim success on the exit code alone.
FINGERPRINT=$(psql "$URL" -tAc "
  SELECT COALESCE(string_agg(t || '=' || n, ' '), 'no tenant tables')
  FROM (
    SELECT 'Product' AS t, COUNT(*) AS n FROM \"Product\"
    UNION ALL SELECT 'Sale', COUNT(*) FROM \"Sale\"
    UNION ALL SELECT 'User', COUNT(*) FROM \"User\"
    UNION ALL SELECT 'Org', COUNT(*) FROM \"Org\"
  ) s;" 2>/dev/null || echo "unreadable")

echo "Data sections in dump: $EXPECTED"
echo "Tables in target:      $ACTUAL"
echo "Row fingerprint:       $FINGERPRINT"

if [ "$ACTUAL" -lt 5 ]; then
  echo "FAILED — the target has almost no tables. The restore did not work." >&2
  exit 1
fi
if [ "$FINGERPRINT" = "unreadable" ] || [ "$FINGERPRINT" = "no tenant tables" ]; then
  echo "FAILED — could not read the restored data back." >&2
  exit 1
fi
if [ "$RC" -ne 0 ]; then
  echo >&2
  echo "FAILED — pg_restore exited $RC. Do NOT assume the data above came from" >&2
  echo "this dump: an unsuccessful restore leaves whatever was there before, and" >&2
  echo "those rows look exactly like a success. Read the errors above, clear the" >&2
  echo "target properly, and run again." >&2
  exit "$RC"
fi

echo
echo "Restore verified — pg_restore exited cleanly and the data reads back."
echo "Compare the fingerprint above against the source before trusting it."
echo
echo "One more step before the app can use this database:"
echo "  psql \"\$RESTORE_URL\" -f scripts/provision-app-role.sql   # recreate the app role"
