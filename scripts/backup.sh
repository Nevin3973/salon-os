#!/usr/bin/env bash
#
# Takes a compressed, timestamped dump of the database and prunes old ones.
#
# Real sales and GST invoices live in here, so this is the difference between a
# bad afternoon and a lost business. Run it on a schedule (cron, Task Scheduler,
# or a GitHub Action) and — this is the part people skip — actually rehearse a
# restore with scripts/restore.sh at least once. An untested backup is a guess.
#
#   DIRECT_URL="postgresql://…" ./scripts/backup.sh [outdir]
#
# Defaults to ./backups, keeps 30 days. Uses the OWNER connection (DIRECT_URL):
# the restricted app role cannot read past row-level security, so a dump taken
# with it would silently come out empty.

set -euo pipefail

OUT_DIR="${1:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
URL="${DIRECT_URL:-${DATABASE_URL:-}}"

if [ -z "$URL" ]; then
  echo "Set DIRECT_URL (preferred) or DATABASE_URL first." >&2
  exit 1
fi
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump not found. Install the PostgreSQL client tools (v16+)." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/salonos-$STAMP.dump"

echo "Backing up to $FILE"
# Custom format (-Fc) so pg_restore can do selective, parallel restores later.
pg_dump --dbname="$URL" --format=custom --no-owner --no-privileges --file="$FILE"

SIZE=$(du -h "$FILE" | cut -f1)
echo "Done — $SIZE"

# A dump that is suspiciously small usually means it hit an empty schema or the
# wrong role; better to shout now than to discover it during a restore.
BYTES=$(wc -c < "$FILE")
if [ "$BYTES" -lt 20000 ]; then
  echo "WARNING: dump is only $BYTES bytes. Check you used the owner connection." >&2
fi

echo "Pruning dumps older than $KEEP_DAYS days"
find "$OUT_DIR" -name 'salonos-*.dump' -type f -mtime "+$KEEP_DAYS" -print -delete || true

echo "Backups on disk:"
ls -1t "$OUT_DIR"/salonos-*.dump 2>/dev/null | head -5
