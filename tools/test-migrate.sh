#!/usr/bin/env bash
# test-migrate.sh — tests for the migration tool
#
# Runs tests against an existing database (default: testdb).
# Uses isolated table names with a per-run prefix to avoid conflicts.
# Requires the database user to have CREATE TABLE privileges.
#
# Usage:
#   PGPASSWORD=password ./tools/test-migrate.sh
#   ./tools/test-migrate.sh -d testdb -U mae -W password

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATE="$SCRIPT_DIR/migrate.sh"

DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="testdb"
DB_USER="mae"
TESTS_PASSED=0
TESTS_FAILED=0
RUN_ID="mig_test_$$"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -d) DB_NAME="$2"; shift 2 ;;
    -U) DB_USER="$2"; shift 2 ;;
    -W) export PGPASSWORD="$2"; shift 2 ;;
    -h) DB_HOST="$2"; shift 2 ;;
    -p) DB_PORT="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

PSQL="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
# Tracking table used by the real migration tool
TRACKING_TABLE="_migrations"
# Temp table we create in migration files for testing
TEMP_TABLE="${RUN_ID}_dummy"

pass() { echo "[PASS] $1"; TESTS_PASSED=$((TESTS_PASSED + 1)); }
fail() { echo "[FAIL] $1"; TESTS_FAILED=$((TESTS_FAILED + 1)); }

# ── Cleanup ───────────────────────────────────────────────────────────────────
cleanup() {
  # Remove any test tracking rows we inserted
  $PSQL -c "DELETE FROM $TRACKING_TABLE WHERE name LIKE '${RUN_ID}%';" > /dev/null 2>&1 || true
  # Drop any temp tables created by test migrations
  $PSQL -c "DROP TABLE IF EXISTS ${TEMP_TABLE};" > /dev/null 2>&1 || true
  # Remove test migration files
  rm -f "$SCRIPT_DIR/migrations/${RUN_ID}"*.sql
}
trap cleanup EXIT

# ── Connectivity check ────────────────────────────────────────────────────────
echo "=== webpost.ing migration tool tests ==="
echo "Database: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
echo ""

$PSQL -c "SELECT 1" > /dev/null 2>&1 || { echo "ERROR: Cannot connect to database."; exit 1; }

# Ensure tracking table exists (migrate.sh creates it, but also create here for isolation)
$PSQL -c "CREATE TABLE IF NOT EXISTS $TRACKING_TABLE (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);" > /dev/null

# ── Test 1: dry-run on a clean state prints "up to date" or shows pending ─────
echo "--- Test 1: dry-run completes without error"
output=$(PGPASSWORD="${PGPASSWORD:-}" bash "$MIGRATE" -d "$DB_NAME" -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" --dry-run 2>&1)
if [[ $? -eq 0 ]] || echo "$output" | grep -qE "up to date|Pending|Dry-run"; then
  pass "dry-run exits without error"
else
  fail "dry-run failed unexpectedly: $output"
fi

# ── Test 2: new migration file is detected as pending ─────────────────────────
echo "--- Test 2: new migration file detected as pending"
cat > "$SCRIPT_DIR/migrations/${RUN_ID}_001_dummy.sql" << EOF
-- Test migration: create a harmless temp table
CREATE TABLE IF NOT EXISTS ${TEMP_TABLE} (id SERIAL PRIMARY KEY, val TEXT);
EOF

output=$(PGPASSWORD="${PGPASSWORD:-}" bash "$MIGRATE" -d "$DB_NAME" -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" --dry-run 2>&1)
if echo "$output" | grep -q "${RUN_ID}_001_dummy.sql"; then
  pass "pending migration detected in dry-run"
else
  fail "pending migration not detected; got: $output"
fi

# ── Test 3: dry-run makes no changes ─────────────────────────────────────────
echo "--- Test 3: dry-run makes no DB changes"
table_before=$($PSQL -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='${TEMP_TABLE}';" | tr -d '[:space:]')
if [[ "$table_before" == "0" ]]; then
  pass "table absent after dry-run (not created)"
else
  fail "table unexpectedly present after dry-run"
fi

# ── Test 4: migration is applied and tracked ──────────────────────────────────
echo "--- Test 4: migration applied and recorded in _migrations"
PGPASSWORD="${PGPASSWORD:-}" bash "$MIGRATE" -d "$DB_NAME" -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" --no-backup > /dev/null 2>&1
table_after=$($PSQL -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='${TEMP_TABLE}';" | tr -d '[:space:]')
tracked=$($PSQL -t -c "SELECT COUNT(*) FROM $TRACKING_TABLE WHERE name='${RUN_ID}_001_dummy.sql';" | tr -d '[:space:]')
if [[ "$table_after" == "1" && "$tracked" == "1" ]]; then
  pass "migration applied and tracked in _migrations"
else
  fail "table_after=$table_after tracked=$tracked (expected both 1)"
fi

# ── Test 5: re-run with no new migrations → reports up to date ───────────────
echo "--- Test 5: second run with no new migrations skips idempotently"
output=$(PGPASSWORD="${PGPASSWORD:-}" bash "$MIGRATE" -d "$DB_NAME" -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" --no-backup 2>&1)
if echo "$output" | grep -q "up to date"; then
  pass "second run reports up to date"
else
  fail "expected 'up to date' on second run; got: $output"
fi

# ── Test 6: bad migration is not tracked ──────────────────────────────────────
echo "--- Test 6: failing migration is not tracked"
cat > "$SCRIPT_DIR/migrations/${RUN_ID}_002_bad.sql" << 'EOFBAD'
-- Intentionally bad migration to test error handling
ALTER TABLE this_table_does_not_exist_xyz ADD COLUMN bad_col TEXT;
EOFBAD

output=$(PGPASSWORD="${PGPASSWORD:-}" bash "$MIGRATE" -d "$DB_NAME" -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" --no-backup 2>&1 || true)
tracked_bad=$($PSQL -t -c "SELECT COUNT(*) FROM $TRACKING_TABLE WHERE name='${RUN_ID}_002_bad.sql';" | tr -d '[:space:]')
if echo "$output" | grep -qiE "error|failed|ERROR"; then
  pass "failing migration reported an error"
else
  fail "failing migration should have reported an error; got: $output"
fi
if [[ "$tracked_bad" == "0" ]]; then
  pass "failed migration not inserted into _migrations"
else
  fail "failed migration should not be tracked; tracked=$tracked_bad"
fi
rm -f "$SCRIPT_DIR/migrations/${RUN_ID}_002_bad.sql"

# ── Test 7: backup file is created when --no-backup is not passed ─────────────
echo "--- Test 7: backup file is created"
# Add a new migration so the tool has work to do
cat > "$SCRIPT_DIR/migrations/${RUN_ID}_003_another.sql" << EOF
-- Another test migration
ALTER TABLE ${TEMP_TABLE} ADD COLUMN IF NOT EXISTS extra TEXT;
EOF

PGPASSWORD="${PGPASSWORD:-}" bash "$MIGRATE" -d "$DB_NAME" -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" > /dev/null 2>&1
backup_count=$(ls "$SCRIPT_DIR/backups/${DB_NAME}_"*.dump 2>/dev/null | wc -l || echo "0")
if [[ "$backup_count" -ge "1" ]]; then
  pass "backup file created in tools/backups/"
  # Clean up backup files from test
  ls "$SCRIPT_DIR/backups/${DB_NAME}_"*.dump 2>/dev/null | tail -1 | xargs rm -f 2>/dev/null || true
else
  fail "no backup file found in tools/backups/"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "=== Results: $TESTS_PASSED passed, $TESTS_FAILED failed ==="
[[ "$TESTS_FAILED" -eq 0 ]] && exit 0 || exit 1
