#!/usr/bin/env bash
# =============================================================
# migrate.sh — apply pending database migrations
#
# Usage:
#   ./config/migrate.sh
#   ./config/migrate.sh --dry-run      (show pending migrations, don't apply)
#   ./config/migrate.sh --status       (show all migrations and their status)
#
# Connection is read from environment variables (same names as
# Spring's application.properties, minus the prefix):
#
#   DB_HOST   (default: localhost)
#   DB_PORT   (default: 5432)
#   DB_NAME   (default: testdb)
#   DB_USER   (default: mae)
#   PGPASSWORD (standard psql env var for password)
#
# Example:
#   DB_NAME=webpostingdb DB_USER=yourname PGPASSWORD=yourpass ./config/migrate.sh
# =============================================================

set -euo pipefail

MIGRATIONS_DIR="$(cd "$(dirname "$0")/migrations" && pwd)"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-testdb}"
DB_USER="${DB_USER:-mae}"
DRY_RUN=false
STATUS_ONLY=false

for arg in "$@"; do
    case "$arg" in
        --dry-run)   DRY_RUN=true ;;
        --status)    STATUS_ONLY=true ;;
        *) echo "Unknown argument: $arg"; exit 1 ;;
    esac
done

PSQL="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"

# ── Ensure schema_migrations table exists ─────────────────────────────────────
$PSQL -q <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
    version    VARCHAR(100) PRIMARY KEY,
    applied_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
SQL

# ── Collect all migration files ───────────────────────────────────────────────
# Use a while-read loop (compatible with bash 3.2 on macOS)
FILES=()
while IFS= read -r f; do
    FILES+=("$f")
done < <(find "$MIGRATIONS_DIR" -name 'V*.sql' | sort)

if [ ${#FILES[@]} -eq 0 ]; then
    echo "No migration files found in $MIGRATIONS_DIR"
    exit 0
fi

# ── Status mode ───────────────────────────────────────────────────────────────
if $STATUS_ONLY; then
    echo ""
    echo "Migration status for $DB_NAME@$DB_HOST:$DB_PORT"
    echo "------------------------------------------------"
    printf "%-40s  %-10s  %s\n" "VERSION" "STATUS" "APPLIED AT"
    echo "------------------------------------------------"
    for f in "${FILES[@]}"; do
        version=$(basename "$f" .sql)
        row=$($PSQL -t -c "SELECT applied_at FROM schema_migrations WHERE version = '$version'" 2>/dev/null | xargs)
        if [ -n "$row" ]; then
            printf "%-40s  %-10s  %s\n" "$version" "applied" "$row"
        else
            printf "%-40s  %-10s\n" "$version" "PENDING"
        fi
    done
    echo ""
    exit 0
fi

# ── Apply pending migrations ──────────────────────────────────────────────────
echo ""
echo "Running migrations on $DB_NAME@$DB_HOST:$DB_PORT"
echo ""

applied=0
skipped=0

for f in "${FILES[@]}"; do
    version=$(basename "$f" .sql)
    count=$($PSQL -t -c "SELECT COUNT(*) FROM schema_migrations WHERE version = '$version'" | xargs)

    if [ "$count" = "1" ]; then
        echo "  [skip]   $version"
        skipped=$((skipped + 1))
    else
        if $DRY_RUN; then
            echo "  [pending] $version"
        else
            echo "  [apply]  $version ..."
            $PSQL -q -f "$f"
            $PSQL -q -c "INSERT INTO schema_migrations (version) VALUES ('$version') ON CONFLICT DO NOTHING"
            echo "           done"
            applied=$((applied + 1))
        fi
    fi
done

echo ""
if $DRY_RUN; then
    echo "Dry run complete. No changes made."
else
    echo "Done. Applied: $applied, Skipped (already applied): $skipped"
fi
echo ""
