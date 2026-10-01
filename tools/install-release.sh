#!/usr/bin/env bash
# install-release.sh — put a release live on the production server.
#
# Runs ON THE SERVER, as root, from inside an unpacked release:
#
#     sudo bash ~/incoming/webposting-<date>-<commit>/install.sh
#
# tools/release.sh on your own computer builds the release, uploads it and
# runs this for you; you only type your password. Nothing is built here: the
# server has 2 GB of memory and building on it is what crashed it on
# 2026-09-30.
#
# What it does, in order. Any failure before step 4 changes nothing.
#   1. checks the release is complete (server.jar, html/index.html)
#   2. backs up the database (pg_dump), the running JAR and the website
#      into ~/backups/release-<timestamp>/
#   3. stages the new JAR and website next to the live ones
#   4. swaps them in (renames, so neither is ever half-written)
#   5. restarts the service and waits for GET /api/health to say ok
#   6. if it does not within HEALTH_TIMEOUT seconds: puts the old JAR and
#      website back, restarts, and exits non-zero
#
# Safe to run twice. Settings come from the server's deploy.env (APP_HOME,
# WEB_ROOT, SERVICE_NAME, DB_NAME); see guide/DEPLOYMENT.md.
#
#   --dry-run   print what would be done, change nothing

set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "$0")" && pwd)"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

# ── Settings ──────────────────────────────────────────────────────────────────
DEPLOY_ENV="${DEPLOY_ENV:-/path/to/deploy.env}"
if [ -f "$DEPLOY_ENV" ]; then
  # Only the four names needed; nothing from the file is printed.
  eval "$(grep -E '^(APP_HOME|WEB_ROOT|SERVICE_NAME|DB_NAME)=' "$DEPLOY_ENV" | sed 's/^/export /')"
fi
APP_HOME="${APP_HOME:-/srv/webposting/app}"
WEB_ROOT="${WEB_ROOT:-/srv/webposting/html}"
SERVICE_NAME="${SERVICE_NAME:-webposting.service}"
DB_NAME="${DB_NAME:-your_database}"
FILE_OWNER="${FILE_OWNER:-root}"                     # owns the JAR and the website
BACKUP_ROOT="${BACKUP_ROOT:-~/backups}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8080/api/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"             # seconds; startup runs migrations
# Overridable only so the script can be rehearsed off the server (with
# REHEARSAL=1, which also lifts the must-be-root check).
RESTART_CMD="${RESTART_CMD:-systemctl restart $SERVICE_NAME}"
BACKUP_DB_CMD="${BACKUP_DB_CMD:-runuser -u postgres -- pg_dump -Fc $DB_NAME}"

JAR="$APP_HOME/server/target/server-0.0.1-SNAPSHOT.jar"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP="$BACKUP_ROOT/release-$STAMP"

say()  { echo "[$(date +%H:%M:%S)] $*"; }
run()  { if [ "$DRY" = 1 ]; then echo "    would run: $*"; else "$@"; fi; }
fail() { echo; echo "FAILED: $*" >&2; exit 1; }

# ── 1. Check ──────────────────────────────────────────────────────────────────
say "Release:  $(cat "$RELEASE_DIR/RELEASE" 2>/dev/null | head -1 || echo unknown)"
say "JAR:      $JAR"
say "Website:  $WEB_ROOT"
say "Service:  $SERVICE_NAME"
[ "$DRY" = 1 ] && say "DRY RUN: nothing will change."
[ "$DRY" = 1 ] || [ "$(id -u)" = 0 ] || [ "${REHEARSAL:-}" = 1 ] || fail "run this with sudo."
[ -s "$RELEASE_DIR/server.jar" ]        || fail "server.jar missing from $RELEASE_DIR"
[ -s "$RELEASE_DIR/html/index.html" ]   || fail "html/index.html missing from $RELEASE_DIR"
[ -f "$JAR" ]                           || fail "no JAR at $JAR; is APP_HOME right?"
[ -d "$WEB_ROOT" ]                      || fail "no website at $WEB_ROOT; is WEB_ROOT right?"

# ── 2. Back up ────────────────────────────────────────────────────────────────
say "Backing up to $BACKUP ..."
run mkdir -p "$BACKUP"
if [ "$DRY" = 1 ]; then
  echo "    would run: $BACKUP_DB_CMD > $BACKUP/$DB_NAME.dump"
else
  $BACKUP_DB_CMD > "$BACKUP/$DB_NAME.dump" || fail "database backup failed; nothing was changed."
  [ -s "$BACKUP/$DB_NAME.dump" ] || fail "database backup is empty; nothing was changed."
fi
run cp -p "$JAR" "$BACKUP/server.jar"
run tar -czf "$BACKUP/html.tgz" -C "$(dirname "$WEB_ROOT")" "$(basename "$WEB_ROOT")"
run chown -R "$FILE_OWNER" "$BACKUP"

# ── 3. Stage ──────────────────────────────────────────────────────────────────
say "Staging ..."
run rm -rf "$WEB_ROOT.new" "$WEB_ROOT.old"
run cp -R "$RELEASE_DIR/html" "$WEB_ROOT.new"
run chown -R "$FILE_OWNER" "$WEB_ROOT.new"
run chmod -R a+rX "$WEB_ROOT.new"
run cp "$RELEASE_DIR/server.jar" "$JAR.new"
run chown "$FILE_OWNER" "$JAR.new"
run chmod a+r "$JAR.new"

# ── 4. Swap ───────────────────────────────────────────────────────────────────
# A rename, never a copy over the live file: the running JVM has the old JAR
# mapped, and a website copied in place is half old, half new for a moment.
say "Swapping in the new version ..."
run mv "$WEB_ROOT" "$WEB_ROOT.old"
run mv "$WEB_ROOT.new" "$WEB_ROOT"
run mv -f "$JAR.new" "$JAR"

# ── 5. Restart and check ──────────────────────────────────────────────────────
healthy() {
  for _ in $(seq 1 "$HEALTH_TIMEOUT"); do
    if curl -fsS "$HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; then return 0; fi
    sleep 1
  done
  return 1
}

# For the rolled-back version: any answer below 500 means it is up. A version
# from before /api/health existed answers 404 there, which still counts.
answering() {
  for _ in $(seq 1 "$HEALTH_TIMEOUT"); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null || true)"
    if [ "${code:-000}" != 000 ] && [ "$code" -lt 500 ]; then return 0; fi
    sleep 1
  done
  return 1
}

say "Restarting $SERVICE_NAME ..."
run $RESTART_CMD
if [ "$DRY" = 1 ]; then say "Dry run complete."; exit 0; fi

say "Waiting up to ${HEALTH_TIMEOUT}s for $HEALTH_URL ..."
if healthy; then
  rm -rf "$WEB_ROOT.old"
  say "LIVE. Backup kept in $BACKUP"
  exit 0
fi

# ── 6. Roll back ──────────────────────────────────────────────────────────────
say "The new version did not come up healthy. Rolling back ..."
cp -p "$BACKUP/server.jar" "$JAR.new" && mv -f "$JAR.new" "$JAR"
rm -rf "$WEB_ROOT" && mv "$WEB_ROOT.old" "$WEB_ROOT"
$RESTART_CMD
if answering; then
  say "Rolled back: the previous version is running again."
else
  say "The previous version did not come up either. Look at: journalctl -u $SERVICE_NAME -n 100"
fi
cat <<EOF

If the new version applied a database migration before failing and the old
one now misbehaves, restore the database taken just before this release:
    sudo systemctl stop $SERVICE_NAME
    sudo -u postgres pg_restore --clean --if-exists -d $DB_NAME $BACKUP/$DB_NAME.dump
    sudo systemctl start $SERVICE_NAME
EOF
exit 1
