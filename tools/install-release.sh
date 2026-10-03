#!/usr/bin/env bash
# install-release.sh — put a release live on the production server.
#
# Runs ON THE SERVER, as root, from inside an unpacked release:
#
#     sudo bash ~/incoming/webposting-<date>-<commit>/install.sh --env /path/to/deploy.env
#
# tools/release.sh on your own computer builds the release, uploads it and
# runs this for you; you only type your password. Nothing is built here: the
# server has 2 GB of memory and building on it is what crashed it on
# 2026-09-30.
#
# What it does, in order. Any failure before step 4 changes nothing.
#   1. checks the release is complete (server.jar, html/index.html)
#   2. backs up the database (pg_dump), the running JAR, the start script and
#      the website into ~/backups/release-<timestamp>/ (the home of whoever
#      ran sudo)
#   3. stages the new JAR, start script and website next to the live ones
#   4. swaps them in (renames, so none is ever half-written)
#   5. restarts the service and waits for GET /api/health to say ok
#   6. if it does not within HEALTH_TIMEOUT seconds: puts the old JAR, start
#      script and website back, restarts, and exits non-zero
#
# The start script (server-start.sh) is installed where the service's unit
# runs it from (systemd's ExecStart, else $APP_HOME/server-start.sh). If that
# cannot be told, or it is not a server-start.sh, it is left alone and the
# script says so. It carries the JVM memory flags (JAVA_OPTS).
#
# Safe to run twice. Every path and name comes from the server's deploy.env
# (APP_HOME, WEB_ROOT, SERVICE_NAME, DB_NAME, SERVER_PORT): nothing about the
# server is written in this script, which is public. See guide/DEPLOYMENT.md.
#
#   --env FILE  the server's deploy.env (required)
#   --dry-run   print what would be done, change nothing

set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "$0")" && pwd)"
DRY=0
DEPLOY_ENV="${DEPLOY_ENV:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --env) DEPLOY_ENV="${2:-}"; shift ;;
    *) echo "Unknown option: $1"; exit 2 ;;
  esac
  shift
done

# ── Settings ──────────────────────────────────────────────────────────────────
# A key's value from deploy.env, or nothing. Always succeeds: a missing
# optional key must not end the script under set -e.
get() { { [ -f "$DEPLOY_ENV" ] && grep -E "^$1=" "$DEPLOY_ENV" | tail -1 | cut -d= -f2- | sed -e "s/^['\"]//" -e "s/['\"]\$//"; } || true; }
APP_HOME="${APP_HOME:-$(get APP_HOME)}"
WEB_ROOT="${WEB_ROOT:-$(get WEB_ROOT)}"
SERVICE_NAME="${SERVICE_NAME:-$(get SERVICE_NAME)}"
DB_NAME="${DB_NAME:-$(get DB_NAME)}"
SERVER_PORT="${SERVER_PORT:-$(get SERVER_PORT)}"
for v in APP_HOME WEB_ROOT SERVICE_NAME DB_NAME; do
  [ -n "${!v}" ] || { echo "$v is unknown: pass the server's deploy.env with --env."; exit 1; }
done
# Whoever owns the running JAR keeps owning the new one.
FILE_OWNER="${FILE_OWNER:-$(ls -ld "$APP_HOME/server/target/server-0.0.1-SNAPSHOT.jar" 2>/dev/null | awk '{print $3}')}"
BACKUP_ROOT="${BACKUP_ROOT:-$(eval echo "~${SUDO_USER:-root}")/backups}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${SERVER_PORT:-8080}/api/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"             # seconds; startup runs migrations
# Overridable only so the script can be rehearsed off the server (with
# REHEARSAL=1, which also lifts the must-be-root check).
RESTART_CMD="${RESTART_CMD:-systemctl restart $SERVICE_NAME}"
EXEC_START_CMD="${EXEC_START_CMD:-systemctl show -p ExecStart $SERVICE_NAME}"
BACKUP_DB_CMD="${BACKUP_DB_CMD:-runuser -u postgres -- pg_dump -Fc $DB_NAME}"

JAR="$APP_HOME/server/target/server-0.0.1-SNAPSHOT.jar"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP="$BACKUP_ROOT/release-$STAMP"

say()  { echo "[$(date +%H:%M:%S)] $*"; }
run()  { if [ "$DRY" = 1 ]; then echo "    would run: $*"; else "$@"; fi; }
fail() { echo; echo "FAILED: $*" >&2; exit 1; }

# ── The start script ──────────────────────────────────────────────────────────
# Where the service starts from: the path in the unit's ExecStart (what really
# runs), else $APP_HOME/server-start.sh when the unit cannot be read. Anything
# that is not a server-start.sh is never overwritten. Sets START (empty means
# "leave it alone") and START_NOTE (why).
START="" START_NOTE=""
UNIT_START="$({ $EXEC_START_CMD 2>/dev/null | sed -n 's/.*{ path=\([^ ;]*\).*/\1/p' | head -1; } || true)"
if [ ! -s "$RELEASE_DIR/server-start.sh" ]; then
  START_NOTE="this release has no server-start.sh (built before it was packed)."
elif [ -n "$UNIT_START" ]; then
  UNIT_START="$(readlink -f "$UNIT_START" 2>/dev/null || echo "$UNIT_START")"
  if [ "$(basename "$UNIT_START")" != server-start.sh ]; then
    START_NOTE="the service starts $UNIT_START, which is not a server-start.sh."
  elif [ ! -f "$UNIT_START" ]; then
    START_NOTE="the service's unit names $UNIT_START, which does not exist."
  else
    START="$UNIT_START"
    [ "$START" = "$APP_HOME/server-start.sh" ] \
      || START_NOTE="the service starts $START, not $APP_HOME/server-start.sh; using that one."
  fi
elif [ -f "$APP_HOME/server-start.sh" ]; then
  START="$APP_HOME/server-start.sh"
  START_NOTE="could not read the service's ExecStart; using $START."
else
  START_NOTE="could not read the service's ExecStart and there is no $APP_HOME/server-start.sh."
fi
# Already the release's version: nothing to install (keeps a rerun quiet).
START_SAME=0
[ -n "$START" ] && cmp -s "$RELEASE_DIR/server-start.sh" "$START" && START_SAME=1
INSTALL_START=0
[ -n "$START" ] && [ "$START_SAME" = 0 ] && INSTALL_START=1
START_OWNER="" START_MODE=755
if [ -n "$START" ]; then
  START_OWNER="$(ls -ld "$START" | awk '{print $3":"$4}')"
  START_MODE="$(stat -c %a "$START" 2>/dev/null || stat -f %Lp "$START" 2>/dev/null || echo 755)"
  [ -x "$START" ] || START_MODE=755   # systemd must be able to run it
fi

# The JVM flags the service will start with, from deploy.env or the release's
# built-in default (server-start.sh reads JAVA_OPTS with an empty value
# meaning no flags).
jvm_flags() {
  if [ -f "$DEPLOY_ENV" ] && grep -qE '^JAVA_OPTS=' "$DEPLOY_ENV"; then
    echo "$(get JAVA_OPTS)   (JAVA_OPTS in deploy.env)"
  else
    echo "$(sed -n 's/^DEFAULT_JAVA_OPTS="\(.*\)"$/\1/p' "$RELEASE_DIR/server-start.sh" | head -1)   (built-in default; set JAVA_OPTS in deploy.env to change)"
  fi
}

# ── 1. Check ──────────────────────────────────────────────────────────────────
say "Release:  $(cat "$RELEASE_DIR/RELEASE" 2>/dev/null | head -1 || echo unknown)"
say "JAR:      $JAR"
say "Website:  $WEB_ROOT"
say "Service:  $SERVICE_NAME"
if [ "$INSTALL_START" = 1 ]; then say "Start:    $START (new version of the start script)"
elif [ "$START_SAME" = 1 ]; then say "Start:    $START (already current)"
else say "Start:    not touched, because $START_NOTE"; fi
[ -z "$START" ] || [ -z "$START_NOTE" ] || say "Note:     $START_NOTE"
[ "$DRY" = 1 ] && say "DRY RUN: nothing will change."
[ "$DRY" = 1 ] || [ "$(id -u)" = 0 ] || [ "${REHEARSAL:-}" = 1 ] || fail "run this with sudo."
[ -s "$RELEASE_DIR/server.jar" ]        || fail "server.jar missing from $RELEASE_DIR"
[ -s "$RELEASE_DIR/html/index.html" ]   || fail "html/index.html missing from $RELEASE_DIR"
[ -f "$JAR" ]                           || fail "no JAR at $JAR; is APP_HOME right?"
[ -d "$WEB_ROOT" ]                      || fail "no website at $WEB_ROOT; is WEB_ROOT right?"
if [ "$INSTALL_START" = 1 ]; then
  bash -n "$RELEASE_DIR/server-start.sh" || fail "the release's server-start.sh has a syntax error; nothing was changed."
  # deploy.env is sourced by the start script: spaces without quotes would
  # run the second word as a command and stop it.
  RAW_OPTS="$(grep -E '^JAVA_OPTS=' "$DEPLOY_ENV" 2>/dev/null | tail -1 | cut -d= -f2- || true)"
  case "$RAW_OPTS" in
    \"*|\'*|"") ;;
    *" "*) fail "JAVA_OPTS in $DEPLOY_ENV has spaces but no quotes, so the start script would stop. Write it as JAVA_OPTS=\"-Xmx640m -Xms256m ...\". Nothing was changed." ;;
  esac
fi

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
[ "$INSTALL_START" = 1 ] && run cp -p "$START" "$BACKUP/server-start.sh"
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
if [ "$INSTALL_START" = 1 ]; then
  run rm -f "$START.new"
  run cp "$RELEASE_DIR/server-start.sh" "$START.new"
  run chown "$START_OWNER" "$START.new"
  run chmod "$START_MODE" "$START.new"
fi

# ── 4. Swap ───────────────────────────────────────────────────────────────────
# A rename, never a copy over the live file: the running JVM has the old JAR
# mapped, and a website copied in place is half old, half new for a moment.
say "Swapping in the new version ..."
run mv "$WEB_ROOT" "$WEB_ROOT.old"
run mv "$WEB_ROOT.new" "$WEB_ROOT"
run mv -f "$JAR.new" "$JAR"
[ "$INSTALL_START" = 1 ] && run mv -f "$START.new" "$START"

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
if [ "$DRY" = 1 ]; then
  [ "$INSTALL_START" = 1 ] || [ "$START_SAME" = 1 ] && say "JVM flags the service would start with: $(jvm_flags)"
  say "Dry run complete."; exit 0
fi

say "Waiting up to ${HEALTH_TIMEOUT}s for $HEALTH_URL ..."
if healthy; then
  rm -rf "$WEB_ROOT.old"
  say "LIVE. Backup kept in $BACKUP"
  if [ "$INSTALL_START" = 1 ] || [ "$START_SAME" = 1 ]; then
    say "JVM flags the service starts with: $(jvm_flags)"
  else
    say "The start script was not replaced ($START_NOTE)"
    say "so JAVA_OPTS (the memory flags) only takes effect if it reads it: see guide/DEPLOYMENT.md section 9.1."
  fi
  exit 0
fi

# ── 6. Roll back ──────────────────────────────────────────────────────────────
say "The new version did not come up healthy. Rolling back ..."
cp -p "$BACKUP/server.jar" "$JAR.new" && mv -f "$JAR.new" "$JAR"
if [ "$INSTALL_START" = 1 ]; then
  cp -p "$BACKUP/server-start.sh" "$START.new" && mv -f "$START.new" "$START"
fi
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
