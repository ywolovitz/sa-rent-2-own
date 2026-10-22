#!/usr/bin/env bash
# Full logical backup of the PROD database (schema + data, all schemas Supabase lets us read).
# Reads PROD_DB_URL (session-pooler connection string) from .env.dbsync — never pass it on the command line.
# Output: backups/prod-<timestamp>.dump (pg_dump custom format, restorable with pg_restore). Gitignored.
set -euo pipefail
cd "$(dirname "$0")/../.."

for d in /opt/homebrew/opt/libpq/bin /usr/local/opt/libpq/bin; do [ -d "$d" ] && PATH="$d:$PATH"; done
export PATH

set -a; source .env.dbsync; set +a
: "${PROD_DB_URL:?PROD_DB_URL missing from .env.dbsync}"

mkdir -p backups
out="backups/prod-$(date +%Y%m%d-%H%M%S).dump"
pg_dump "$PROD_DB_URL" --format=custom --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage --file="$out"
ls -lh "$out"
pg_restore --list "$out" | grep -c 'TABLE DATA' | xargs echo "table-data entries in dump:"
