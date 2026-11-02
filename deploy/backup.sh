#!/usr/bin/env bash
#
# Dumps the catalog, keeping the last N days.
#
# Most of this database can be rebuilt by running `pnpm sync` again. What
# cannot is the part an operator typed: rows where `locked` is true, which is
# every hand-corrected stream address and every hand-added channel. The sync
# deliberately reads past those, so nothing upstream will ever restore them.
#
#   /srv/tuner/deploy/backup.sh
#   0 4 * * * /srv/tuner/deploy/backup.sh >> /var/log/tuner-backup.log 2>&1

set -Eeuo pipefail

APP_DIR="/srv/tuner"
BACKUP_DIR="${TUNER_BACKUP_DIR:-/srv/backups/tuner}"
KEEP_DAYS="${TUNER_BACKUP_KEEP_DAYS:-14}"

# The same credentials the application uses, read from the file it reads.
if [ -f "$APP_DIR/.env" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" | head -1 | cut -d= -f2-)"
fi
: "${DATABASE_URL:?DATABASE_URL is not set and $APP_DIR/.env does not name one}"

mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y-%m-%d-%H%M)"
target="$BACKUP_DIR/tuner-$stamp.sql.gz"

# Written to a partial name first, so an interrupted dump is never mistaken
# for a good one by the restore command or by the retention sweep below.
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$target.partial"
mv "$target.partial" "$target"

size="$(du -h "$target" | cut -f1)"
echo "$(date -Is) wrote $target ($size)"

find "$BACKUP_DIR" -name 'tuner-*.sql.gz' -mtime "+$KEEP_DAYS" -print -delete
find "$BACKUP_DIR" -name '*.partial' -mtime +1 -print -delete

# A dump that cannot be read is not a backup.
if ! gzip -t "$target"; then
  echo "✗ $target did not survive its own integrity check" >&2
  exit 1
fi
