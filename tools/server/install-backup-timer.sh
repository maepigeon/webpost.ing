#!/usr/bin/env bash
# install-backup-timer.sh — schedule the nightly database backup on the server.
#
# Runs ON THE SERVER, as root, from an unpacked release (or the repository):
#
#     sudo bash ~/incoming/webposting-<date>-<commit>/server-tools/install-backup-timer.sh --env /path/to/deploy.env
#
# What it sets up:
#   - a systemd timer that runs backup.sh --nightly every night at 03:30
#     (server time), at the lowest CPU and disk priority, as the service's own
#     user (the one that already reaches the database and owns the uploads)
#   - the dumps go to /var/backups/webposting, owned by that user, group = the
#     login that ran sudo, mode 2750: you can read and download them without
#     sudo, no one else can. 7 daily and 4 weekly dumps are kept.
#   - backup.sh is copied to /usr/local/lib/webposting/ (root-owned, so the
#     service cannot change what runs as it)
# It does not copy anything off the server: that is tools/download-backup.sh on
# your own computer (guide/DEPLOYMENT.md section 6). Nothing is downloaded or
# built here; the only heavy thing the timer ever runs is one pg_dump.
#
# Steps; any failure before step 3 changes nothing but an empty folder:
#   1. checks everything (settings, database access as the service's user,
#      the script's syntax, free disk)
#   2. creates the backup folder and checks it as the service's user
#   3. installs the script, the service and the timer, and starts the timer
#   4. offers to take the first backup now (so you see it work)
#
#   --env FILE      the server's deploy.env (required)
#   --at HH:MM      time of day (default 03:30)
#   --dir PATH      where dumps go (default /var/backups/webposting)
#   --script FILE   backup.sh (default: next to this script, or ../backup.sh)
#   --no-first-run  do not offer the first backup
#   --remove        stop the timer and remove what this installed (dumps stay)
#   --dry-run       print what would be done, change nothing
#
# Safe to run twice: it rewrites the same files and says "already current".
# Optional, in deploy.env: HEARTBEAT_URL (a healthchecks.io ping URL; the
# nightly run pings it, and /fail on a failure) and BACKUP_KEEP_DAILY /
# BACKUP_KEEP_WEEKLY.

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DRY=0 REMOVE=0 FIRST_RUN=1
DEPLOY_ENV="${DEPLOY_ENV:-}" AT="03:30" DIR="/var/backups/webposting" SCRIPT_SRC=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --remove) REMOVE=1 ;;
    --no-first-run) FIRST_RUN=0 ;;
    --env) DEPLOY_ENV="${2:-}"; shift ;;
    --at) AT="${2:-}"; shift ;;
    --dir) DIR="${2:-}"; shift ;;
    --script) SCRIPT_SRC="${2:-}"; shift ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1"; exit 2 ;;
  esac
  shift
done

say()  { echo "[$(date +%H:%M:%S)] $*"; }
fail() { echo; echo "FAILED: $*" >&2; exit 1; }
run()  { if [ "$DRY" = 1 ]; then echo "    would run: $*"; else "$@"; fi; }
# Paths and the root check are overridable only so the script can be rehearsed
# off a server (REHEARSAL=1 also skips chown, which needs root).
LIB_DIR="${LIB_DIR:-/usr/local/lib/webposting}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
own() { [ "${REHEARSAL:-}" = 1 ] || chown "$@"; }
setgid_dir() { chmod 2750 "$1" 2>/dev/null || { [ "${REHEARSAL:-}" = 1 ] && chmod 750 "$1"; }; }
UNIT=webposting-backup

[ "$DRY" = 1 ] || [ "$(id -u)" = 0 ] || [ "${REHEARSAL:-}" = 1 ] || fail "run this with sudo."

if [ "$REMOVE" = 1 ]; then
  say "Removing the backup timer (dumps in $DIR are kept) ..."
  run systemctl disable --now "$UNIT.timer" 2>/dev/null || true
  run rm -f "$SYSTEMD_DIR/$UNIT.service" "$SYSTEMD_DIR/$UNIT.timer" "$LIB_DIR/backup.sh"
  run systemctl daemon-reload
  say "Removed."; exit 0
fi

[ -n "$DEPLOY_ENV" ] && [ -f "$DEPLOY_ENV" ] || fail "usage: sudo bash $0 --env /path/to/deploy.env"
case "$AT" in [0-2][0-9]:[0-5][0-9]) ;; *) fail "--at wants a time like 03:30." ;; esac
case "$DIR" in /*) ;; *) fail "--dir must be an absolute path." ;; esac

get() { { grep -E "^$1=" "$DEPLOY_ENV" | tail -1 | cut -d= -f2- | sed -e "s/^['\"]//" -e "s/['\"]\$//"; } || true; }
DB_NAME="$(get DB_NAME)"; DB_USER="$(get DB_USER)"; SERVICE_NAME="$(get SERVICE_NAME)"; UPLOAD_DIR="$(get UPLOAD_DIR)"
HEARTBEAT="$(get HEARTBEAT_URL)"
for v in DB_NAME DB_USER SERVICE_NAME UPLOAD_DIR; do [ -n "${!v}" ] || fail "$v is not set in $DEPLOY_ENV"; done

# ── 1. Check ──────────────────────────────────────────────────────────────────
APP_USER="${APP_USER:-$(systemctl show -p User --value "$SERVICE_NAME" 2>/dev/null || true)}"
[ -n "$APP_USER" ] && [ "$APP_USER" != root ] || fail "the service must run as its own user, not root (it runs as '${APP_USER:-root}')."
APP_GROUP="$(id -gn "$APP_USER")"
DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-}}"
[ -n "$DEPLOY_USER" ] && [ "$DEPLOY_USER" != root ] || fail "run this with sudo from your own login (not as root directly): the backups are made readable to that login."
DEPLOY_GROUP="$(id -gn "$DEPLOY_USER")"
command -v pg_dump >/dev/null 2>&1 || fail "pg_dump is not installed."
command -v systemctl >/dev/null 2>&1 || fail "systemctl not found; this needs systemd."
[ -d "$UPLOAD_DIR" ] || fail "UPLOAD_DIR $UPLOAD_DIR does not exist."

[ -n "$SCRIPT_SRC" ] || for c in "$HERE/backup.sh" "$HERE/../backup.sh"; do [ -f "$c" ] && { SCRIPT_SRC="$c"; break; }; done
[ -f "$SCRIPT_SRC" ] || fail "backup.sh not found next to this script or in ../; pass it with --script FILE."
bash -n "$SCRIPT_SRC" || fail "$SCRIPT_SRC has a syntax error; nothing was changed."

say "Database $DB_NAME as $DB_USER, uploads in $UPLOAD_DIR"
say "Runs as $APP_USER every night at $AT (server time: $(date +%Z)); dumps go to $DIR (group $DEPLOY_GROUP, readable by $DEPLOY_USER)"
[ -n "$HEARTBEAT" ] && say "Heartbeat: HEARTBEAT_URL is set in deploy.env." \
  || say "Heartbeat: none (optional: add HEARTBEAT_URL=<ping URL> to deploy.env, see guide/DEPLOYMENT.md section 6)."
if [ "$(id -u)" = 0 ] && ! runuser -u "$DEPLOY_USER" -- test -r "$UPLOAD_DIR" -a -x "$UPLOAD_DIR" 2>/dev/null; then
  say "Note: $DEPLOY_USER cannot read the uploads folder, so tools/download-backup.sh will ask for your sudo password to copy it."
fi
[ "$DRY" = 1 ] && say "DRY RUN: nothing will change."

# ── 2. The folder, checked as the service's user ──────────────────────────────
say "Preparing $DIR ..."
run mkdir -p "$DIR"
run own "$APP_USER:$DEPLOY_GROUP" "$DIR"
run setgid_dir "$DIR"       # mode 2750: the setgid bit keeps every dump in the deploy group

CHECK_DIR=""
if [ "$DRY" = 0 ]; then
  # The service's user may not be able to read where the release was unpacked,
  # so the check runs from a copy it can.
  CHECK_DIR="$(mktemp -d)"; chmod 755 "$CHECK_DIR"; cp "$SCRIPT_SRC" "$CHECK_DIR/backup.sh"; chmod 755 "$CHECK_DIR/backup.sh"
  trap 'rm -rf "$CHECK_DIR"' EXIT
  say "Checking as $APP_USER (database, uploads, folder, disk) ..."
  if [ "$(id -u)" = 0 ]; then
    runuser -u "$APP_USER" -- bash "$CHECK_DIR/backup.sh" --nightly --check --env "$DEPLOY_ENV" "$DIR" \
      || fail "the check failed (its message is above); no timer was installed."
  else
    bash "$CHECK_DIR/backup.sh" --nightly --check --env "$DEPLOY_ENV" "$DIR" || fail "the check failed; no timer was installed."
  fi
else
  echo "    would run as $APP_USER: backup.sh --nightly --check --env $DEPLOY_ENV $DIR"
fi

# ── 3. Install ────────────────────────────────────────────────────────────────
say "Installing ..."
SERVICE="[Unit]
Description=webpost.ing nightly database backup
After=postgresql.service

[Service]
Type=oneshot
User=$APP_USER
Group=$APP_GROUP
UMask=0027
Nice=19
IOSchedulingClass=idle
TimeoutStartSec=30min
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$DIR
ExecStart=$LIB_DIR/backup.sh --nightly --env $DEPLOY_ENV $DIR
"
TIMER="[Unit]
Description=webpost.ing nightly database backup

[Timer]
OnCalendar=*-*-* $AT:00
RandomizedDelaySec=10min
Persistent=true

[Install]
WantedBy=timers.target
"
put() {  # $1 path, $2 content, $3 mode
  if [ -f "$1" ] && [ "$(cat "$1")" = "$(printf '%s' "$2")" ]; then say "$1 is already current."; return 0; fi
  if [ "$DRY" = 1 ]; then echo "    would write $1"; return 0; fi
  printf '%s' "$2" > "$1.new"; chmod "$3" "$1.new"; mv -f "$1.new" "$1"; say "wrote $1"
}
run mkdir -p "$LIB_DIR"
if [ -f "$LIB_DIR/backup.sh" ] && cmp -s "$SCRIPT_SRC" "$LIB_DIR/backup.sh"; then say "$LIB_DIR/backup.sh is already current."
elif [ "$DRY" = 1 ]; then echo "    would copy $SCRIPT_SRC to $LIB_DIR/backup.sh"
else cp "$SCRIPT_SRC" "$LIB_DIR/backup.sh.new"; own root:root "$LIB_DIR/backup.sh.new"; chmod 755 "$LIB_DIR/backup.sh.new"; mv -f "$LIB_DIR/backup.sh.new" "$LIB_DIR/backup.sh"; say "wrote $LIB_DIR/backup.sh"; fi
put "$SYSTEMD_DIR/$UNIT.service" "$SERVICE" 644
put "$SYSTEMD_DIR/$UNIT.timer" "$TIMER" 644
run systemctl daemon-reload
run systemctl enable --now "$UNIT.timer"
[ "$DRY" = 1 ] || { systemctl list-timers "$UNIT.timer" --no-pager 2>/dev/null | head -3 || true; }

# ── 4. First backup ───────────────────────────────────────────────────────────
if [ "$DRY" = 1 ] || [ "$FIRST_RUN" = 0 ]; then
  say "Done. The first backup runs tonight; to run one now: sudo systemctl start $UNIT.service"
  exit 0
fi
answer=y
if [ -t 0 ]; then read -r -p "Take the first backup now (one pg_dump, about a minute)? [Y/n] " answer || answer=n; fi
case "${answer:-y}" in
  n|N) say "Done. To run one now: sudo systemctl start $UNIT.service" ;;
  *)
    say "Running it once ..."
    if systemctl start "$UNIT.service"; then
      say "First backup done: $(ls -1 "$DIR" | grep -E '^db_.*\.dump$' | tail -1) in $DIR"
    else
      echo; echo "The first backup failed. The timer is installed; see what went wrong with:" >&2
      echo "    sudo journalctl -u $UNIT.service -n 50 --no-pager" >&2
      exit 1
    fi ;;
esac
say "Finished. From your own computer: tools/download-backup.sh"
