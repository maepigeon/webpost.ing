#!/usr/bin/env bash
# backup.sh — take a complete backup: database *and* uploaded files.
#
#   ./tools/backup.sh [destination-directory]
#
# `pg_dump` alone is not a backup of this application. Images, avatars and fonts
# live on disk, so a database-only restore brings back every post with every
# image broken. This takes both, with matching timestamps so a pair can be
# restored together.
#
# Reads connection settings from deploy.env; see guide/CONFIGURATION.md.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/deploy.env"

if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
else
  echo "WARNING: no deploy.env; falling back to development defaults."
fi

DB_HOST="${DB_SOCKET:-${DB_HOST:-localhost}}"   # a socket directory works as -h
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-testdb}"
DB_USER="${DB_USER:-${USER:-}}"
UPLOAD_DIR="${UPLOAD_DIR:-$REPO_ROOT/server/uploads}"

DEST="${1:-$REPO_ROOT/backups}"
STAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$DEST"

echo "=== webpost.ing backup $STAMP ==="
echo "    database : $DB_NAME on $DB_HOST:$DB_PORT"
echo "    uploads  : $UPLOAD_DIR"
echo "    into     : $DEST"

# ── Database ──────────────────────────────────────────────────────────────────
DB_FILE="$DEST/db_$STAMP.dump"
echo "[1/3] Dumping the database..."
PGPASSWORD="${DB_PASSWORD:-}" pg_dump -Fc -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" > "$DB_FILE"
echo "      $(du -h "$DB_FILE" | cut -f1) → $DB_FILE"

# ── Uploaded files ────────────────────────────────────────────────────────────
UPLOADS_FILE="$DEST/uploads_$STAMP.tar.gz"
echo "[2/3] Archiving uploads..."
if [ -d "$UPLOAD_DIR" ]; then
  tar czf "$UPLOADS_FILE" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"
  echo "      $(du -h "$UPLOADS_FILE" | cut -f1) → $UPLOADS_FILE"
else
  echo "      WARNING: $UPLOAD_DIR does not exist; nothing archived."
fi

# ── Verify ────────────────────────────────────────────────────────────────────
# An unreadable backup is worse than no backup, because you believe you have one.
echo "[3/3] Verifying..."
if pg_restore --list "$DB_FILE" > /dev/null 2>&1; then
  echo "      Database dump reads back cleanly."
else
  echo "      ERROR: the dump could not be read back. Do not rely on it."
  exit 1
fi
if [ -f "$UPLOADS_FILE" ] && ! tar tzf "$UPLOADS_FILE" > /dev/null 2>&1; then
  echo "      ERROR: the uploads archive is corrupt."
  exit 1
fi

echo ""
echo "=== Backup complete. ==="
echo "Restore with:"
echo "  pg_restore -c -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME $DB_FILE"
echo "  tar xzf $UPLOADS_FILE -C $(dirname "$UPLOAD_DIR")"
