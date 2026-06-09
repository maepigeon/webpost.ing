#!/usr/bin/env bash
# migrate.sh — webpost.ing database migration tool
#
# Usage:
#   ./tools/migrate.sh [OPTIONS]
#
# Options:
#   -h HOST       DB host     (default: localhost)
#   -p PORT       DB port     (default: 5432)
#   -d DATABASE   DB name     (default: testdb)
#   -U USER       DB user     (default: mae)
#   -W PASSWORD   DB password (reads PGPASSWORD env var if not set)
#   --dry-run     Print pending migrations without applying them
#   --no-backup   Skip the pg_dump backup step (not recommended)
#
# Examples:
#   PGPASSWORD=secret ./tools/migrate.sh
#   ./tools/migrate.sh -d mydb -U myuser -W mypass
#   ./tools/migrate.sh --dry-run

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/migrations"
BACKUP_DIR="$SCRIPT_DIR/backups"

# ── Defaults ──────────────────────────────────────────────────────────────────
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="testdb"
DB_USER="mae"
DRY_RUN=false
NO_BACKUP=false

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h) DB_HOST="$2"; shift 2 ;;
    -p) DB_PORT="$2"; shift 2 ;;
    -d) DB_NAME="$2"; shift 2 ;;
    -U) DB_USER="$2"; shift 2 ;;
    -W) export PGPASSWORD="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --no-backup) NO_BACKUP=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

PSQL="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
PG_DUMP="pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER"

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo "[migrate] $*"; }
err()  { echo "[migrate] ERROR: $*" >&2; }
fail() { err "$*"; exit 1; }

# ── Verify connectivity ───────────────────────────────────────────────────────
log "Connecting to $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME …"
$PSQL -c "SELECT 1" > /dev/null 2>&1 || fail "Cannot connect to database. Check credentials and that PostgreSQL is running."

# ── Create migration tracking table ──────────────────────────────────────────
$PSQL -c "
  CREATE TABLE IF NOT EXISTS _migrations (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  );
" > /dev/null

# ── Find pending migrations ───────────────────────────────────────────────────
mapfile -t ALL_FILES < <(find "$MIGRATIONS_DIR" -name "*.sql" | sort)

PENDING=()
for f in "${ALL_FILES[@]}"; do
  name="$(basename "$f")"
  applied=$($PSQL -t -c "SELECT COUNT(*) FROM _migrations WHERE name='$name';" | tr -d '[:space:]')
  if [[ "$applied" == "0" ]]; then
    PENDING+=("$f")
  fi
done

if [[ ${#PENDING[@]} -eq 0 ]]; then
  log "No pending migrations. Database is up to date."
  exit 0
fi

log "Pending migrations (${#PENDING[@]}):"
for f in "${PENDING[@]}"; do
  log "  - $(basename "$f")"
done

if [[ "$DRY_RUN" == "true" ]]; then
  log "Dry-run mode — no changes made."
  exit 0
fi

# ── Backup ────────────────────────────────────────────────────────────────────
BACKUP_FILE=""
if [[ "$NO_BACKUP" == "false" ]]; then
  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_$(date +%Y%m%d_%H%M%S).dump"
  log "Creating backup: $BACKUP_FILE"
  $PG_DUMP -Fc "$DB_NAME" -f "$BACKUP_FILE" || fail "pg_dump failed. Aborting before any changes."
  log "Backup complete."
fi

# ── Apply migrations ──────────────────────────────────────────────────────────
APPLIED=0
FAILED_MIGRATION=""

restore_and_exit() {
  err "Migration failed: $FAILED_MIGRATION"
  if [[ -n "$BACKUP_FILE" ]]; then
    err "Restoring database from backup: $BACKUP_FILE"
    # Drop and recreate the database, then restore
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
      -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB_NAME' AND pid <> pg_backend_pid();" > /dev/null 2>&1 || true
    pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
      --clean --if-exists "$BACKUP_FILE" \
      && log "Restore succeeded." \
      || err "Restore also failed — manual intervention required. Backup is at: $BACKUP_FILE"
  else
    err "No backup was made. Manual intervention required."
  fi
  exit 1
}

for f in "${PENDING[@]}"; do
  name="$(basename "$f")"
  log "Applying: $name"
  FAILED_MIGRATION="$name"

  # Build a single SQL script: wrap migration in a transaction, record it if successful
  WRAPPED_SQL=$(cat "$f"; echo ""; echo "INSERT INTO _migrations(name) VALUES ('$name');")

  if echo "$WRAPPED_SQL" | $PSQL -v ON_ERROR_STOP=1 --single-transaction > /dev/null 2>&1; then
    APPLIED=$((APPLIED + 1))
    log "  ✓ $name applied."
  else
    # Re-run with verbose output to surface the actual error
    echo "$WRAPPED_SQL" | $PSQL -v ON_ERROR_STOP=1 --single-transaction 2>&1 | sed 's/^/  /' >&2 || true
    restore_and_exit
  fi
done

log "Migration complete. Applied $APPLIED migration(s)."
if [[ -n "$BACKUP_FILE" ]]; then
  log "Backup retained at: $BACKUP_FILE"
fi
