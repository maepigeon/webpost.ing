#!/usr/bin/env bash
# reset-schema.sh — move an existing database onto the current single-file
# schema (db/migrations/V001__schema.sql), keeping its data.
#
#   ./tools/reset-schema.sh            do it
#   ./tools/reset-schema.sh --dry-run  show the plan, change nothing
#
# Why: the migration history was squashed into one file. A database built
# from the old chain has already recorded V001–V024 and would try to apply
# the new V001 on top of itself. This builds a fresh database from the new
# schema, copies every row across, and swaps the two by renaming. The old
# database is kept, renamed, until you drop it yourself.
#
# Stop the app first: a database cannot be renamed while anything is
# connected to it.
#
# Settings come from deploy.env (DB_HOST, DB_PORT, DB_NAME, DB_USER,
# DB_PASSWORD). Creating and renaming databases, and loading rows without
# tripping foreign keys, need a superuser. On a server that is usually:
#
#     ADMIN_PSQL="sudo -u postgres psql" ./tools/reset-schema.sh
#
# Locally (Postgres.app) your own user already is one, and the default works.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# deploy.env supplies the settings, but anything already set on the command
# line wins (e.g. DB_NAME=scratch ./tools/reset-schema.sh to rehearse on a copy).
for v in DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD; do eval "_pre_$v=\${$v-}"; done
[ -f "$REPO_ROOT/deploy.env" ] && { set -a; . "$REPO_ROOT/deploy.env"; set +a; }
for v in DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD; do eval "if [ -n \"\$_pre_$v\" ]; then $v=\"\$_pre_$v\"; fi"; done

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-testdb}"
DB_USER="${DB_USER:-mae}"
export PGPASSWORD="${DB_PASSWORD:-${PGPASSWORD:-}}"
ADMIN_PSQL="${ADMIN_PSQL:-psql -h $DB_HOST -p $DB_PORT -U $DB_USER}"

SCHEMA="$REPO_ROOT/server/src/main/resources/db/migrations/V001__schema.sql"
STAMP="$(date +%Y%m%d_%H%M%S)"
NEW_DB="${DB_NAME}_rebuild_$STAMP"
OLD_DB="${DB_NAME}_before_reset_$STAMP"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

user_psql() { psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -v ON_ERROR_STOP=1 -X -q "$@"; }
admin()     { $ADMIN_PSQL -v ON_ERROR_STOP=1 -X -q "$@"; }

[ -f "$SCHEMA" ] || { echo "ERROR: $SCHEMA not found."; exit 1; }

echo "=== Reset $DB_NAME onto $(basename "$SCHEMA") ==="
echo "    new database   : $NEW_DB (renamed to $DB_NAME at the end)"
echo "    old database   : kept as $OLD_DB"
if user_psql -d "$DB_NAME" -Atc "SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() LIMIT 1" | grep -q 1; then
  echo "ERROR: something else is connected to $DB_NAME. Stop the app first."
  [ "$DRY" = 1 ] || exit 1
fi
[ "$DRY" = 1 ] && { echo "Dry run: nothing changed."; exit 0; }

echo "[1/5] Backing up (tools/backup.sh)..."
[ "${SKIP_BACKUP:-0}" = 1 ] || "$REPO_ROOT/tools/backup.sh"

echo "[2/5] Building $NEW_DB from the schema..."
admin -d postgres -c "CREATE DATABASE \"$NEW_DB\" OWNER \"$DB_USER\";"
admin -d "$NEW_DB" -c "GRANT ALL ON SCHEMA public TO \"$DB_USER\";"
user_psql -d "$NEW_DB" -f "$SCHEMA" > /dev/null
# Seed rows come from the schema file; the copied data replaces them.
TABLES=$(user_psql -d "$NEW_DB" -Atc "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1")

echo "[3/5] Copying rows..."
for t in $TABLES; do
  exists=$(user_psql -d "$DB_NAME" -Atc "SELECT to_regclass('public.$t') IS NOT NULL")
  [ "$exists" = "t" ] || { echo "    $t: new table, nothing to copy"; continue; }
  # Only the columns both sides have: the old database may carry columns the
  # squashed schema dropped, or lack ones it added.
  new_cols=$(user_psql -d "$NEW_DB" -Atc "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '$t'")
  old_cols=$(user_psql -d "$DB_NAME" -Atc "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '$t' ORDER BY ordinal_position")
  cols=$(for c in $old_cols; do if echo "$new_cols" | grep -qx "$c"; then printf '"%s",' "$c"; fi; done | sed 's/,$//')
  [ -n "$cols" ] || { echo "    $t: no shared columns, skipped"; continue; }
  user_psql -d "$DB_NAME" -c "\\copy (SELECT $cols FROM public.\"$t\") TO STDOUT" \
    | admin -d "$NEW_DB" -c "SET session_replication_role = replica;" -c "DELETE FROM public.\"$t\";" -c "\\copy public.\"$t\" ($cols) FROM STDIN"
  echo "    $t: $(user_psql -d "$NEW_DB" -Atc "SELECT count(*) FROM public.\"$t\"") rows"
done

echo "[4/5] Resetting sequences and recording the schema..."
user_psql -d "$NEW_DB" -Atc "
  SELECT format('SELECT setval(%L, GREATEST(COALESCE((SELECT max(%I) FROM %I.%I), 0), 1), (SELECT max(%I) FROM %I.%I) IS NOT NULL);',
                s.seq, c.column_name, c.table_schema, c.table_name, c.column_name, c.table_schema, c.table_name)
    FROM information_schema.columns c
    CROSS JOIN LATERAL (SELECT pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) AS seq) s
   WHERE c.table_schema = 'public' AND s.seq IS NOT NULL" | user_psql -d "$NEW_DB" > /dev/null
CHECKSUM=$(shasum -a 256 "$SCHEMA" 2>/dev/null || sha256sum "$SCHEMA")
CHECKSUM=$(echo "$CHECKSUM" | cut -c1-16)
user_psql -d "$NEW_DB" -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), checksum VARCHAR(64));
  INSERT INTO schema_migrations (version, checksum) VALUES ('V001__schema', '$CHECKSUM');"

echo "[5/5] Swapping databases..."
admin -d postgres -c "ALTER DATABASE \"$DB_NAME\" RENAME TO \"$OLD_DB\";"
admin -d postgres -c "ALTER DATABASE \"$NEW_DB\" RENAME TO \"$DB_NAME\";"

echo ""
echo "=== Done. $DB_NAME now runs on the single-file schema. ==="
echo "    Start the app and check it. When you are happy:"
echo "      $ADMIN_PSQL -d postgres -c 'DROP DATABASE \"$OLD_DB\";'"
