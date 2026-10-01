#!/usr/bin/env bash
# use-passwordless-db.sh — connect the app to PostgreSQL with no password.
#
# Runs ON THE SERVER, as root, once, after a release that includes
# DatabaseSocketConfig (2026-10-01 or later):
#
#     sudo bash use-passwordless-db.sh /path/to/deploy.env
#
# Afterwards the app reaches the database over PostgreSQL's Unix socket with
# peer authentication: PostgreSQL trusts the operating-system user the
# service runs as, so no database password exists anywhere: not in deploy.env,
# not in a backup, not in a chat.
#
#   1. maps the service's OS user to the database user (pg_ident.conf) and lets
#      that mapping in over the socket (a line at the top of pg_hba.conf)
#   2. checks the service's user can connect that way
#   3. sets DB_SOCKET in deploy.env and removes DB_PASSWORD from it
#   4. restarts the service and waits for /api/health
#   5. on success, asks whether to remove the password from the database role
#      too (recommended: the old password then stops working, wherever it is)
# Any failure puts every file back as it was and restarts the service.
# Running it again changes nothing.

set -euo pipefail
ENV_FILE="${1:-}"
say()  { echo "[$(date +%H:%M:%S)] $*"; }
fail() { echo; echo "FAILED: $*" >&2; exit 1; }
[ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ] || fail "usage: sudo bash $0 /path/to/deploy.env"
[ "$(id -u)" = 0 ] || fail "run this with sudo."

get() { { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e "s/^['\"]//" -e "s/['\"]\$//"; } || true; }
DB_NAME="$(get DB_NAME)"; DB_USER="$(get DB_USER)"; SERVICE_NAME="$(get SERVICE_NAME)"; APP_HOME="$(get APP_HOME)"
PORT="$(get SERVER_PORT)"; PORT="${PORT:-8080}"
for v in DB_NAME DB_USER SERVICE_NAME APP_HOME; do [ -n "${!v}" ] || fail "$v is not set in $ENV_FILE"; done
APP_USER="$(systemctl show -p User --value "$SERVICE_NAME")"
[ -n "$APP_USER" ] && [ "$APP_USER" != root ] || fail "the service must run as its own user, not root (it runs as '${APP_USER:-root}')."
JAR="$APP_HOME/server/target/server-0.0.1-SNAPSHOT.jar"
grep -q DatabaseSocketConfig "$JAR" 2>/dev/null || fail "the running release cannot use a socket yet; release a newer version first."

pg() { runuser -u postgres -- psql -XAtqc "$1"; }
HBA="$(pg 'show hba_file')"; IDENT="$(pg 'show ident_file')"
SOCKET_DIR="$(pg 'show unix_socket_directories' | cut -d, -f1 | xargs)"
MAP="webposting_app"
HBA_LINE="local   $DB_NAME   $DB_USER   peer map=$MAP"
IDENT_LINE="$MAP   $APP_USER   $DB_USER"
say "Database $DB_NAME as $DB_USER, for the service's OS user $APP_USER, through $SOCKET_DIR"

SAVE="/root/passwordless-db-$(date +%Y%m%d_%H%M%S)"
mkdir -m 700 "$SAVE"
cp -p "$HBA" "$SAVE/pg_hba.conf"; cp -p "$IDENT" "$SAVE/pg_ident.conf"
cp -p "$ENV_FILE" "$SAVE/deploy.env"; chmod 600 "$SAVE/deploy.env"

restore() {
  say "Putting everything back ..."
  cp -p "$SAVE/pg_hba.conf" "$HBA"; cp -p "$SAVE/pg_ident.conf" "$IDENT"; cp -p "$SAVE/deploy.env" "$ENV_FILE"
  pg 'select pg_reload_conf()' >/dev/null
  systemctl restart "$SERVICE_NAME"
}
healthy() {
  for _ in $(seq 1 120); do
    curl -fsS "http://127.0.0.1:$PORT/api/health" 2>/dev/null | grep -q '"status":"ok"' && return 0
    sleep 1
  done
  return 1
}

# ── 1. Allow the mapping ──────────────────────────────────────────────────────
grep -qE "^[[:space:]]*$MAP[[:space:]]+$APP_USER[[:space:]]+$DB_USER[[:space:]]*\$" "$IDENT" || echo "$IDENT_LINE" >> "$IDENT"
if ! grep -qF "$HBA_LINE" "$HBA"; then
  # pg_hba.conf is read top-down and the first matching line wins, so it goes
  # before every existing rule.
  awk -v line="$HBA_LINE" 'BEGIN{done=0} !done && $0 !~ /^[[:space:]]*(#|$)/ {print "# Added by use-passwordless-db.sh: the app connects with no password."; print line; done=1} {print}' "$SAVE/pg_hba.conf" > "$HBA"
fi
pg 'select pg_reload_conf()' >/dev/null
if [ "$(pg "select count(*) from pg_hba_file_rules where error is not null")" != 0 ]; then
  restore; fail "pg_hba.conf did not parse; restored."
fi

# ── 2. Check the service's user can get in ────────────────────────────────────
if [ "$(runuser -u "$APP_USER" -- psql -XAtq -h "$SOCKET_DIR" -d "$DB_NAME" -U "$DB_USER" -c 'select 1' 2>&1)" != 1 ]; then
  restore; fail "$APP_USER could not connect as $DB_USER over the socket; restored."
fi
say "The service's user connects with no password."

# ── 3. deploy.env ─────────────────────────────────────────────────────────────
sed -i -e '/^DB_PASSWORD=/d' -e '/^DB_SOCKET=/d' "$ENV_FILE"
printf '\n# Passwordless database access over the local socket (use-passwordless-db.sh).\nDB_SOCKET=%s\n' "$SOCKET_DIR" >> "$ENV_FILE"

# ── 4. Restart and check ──────────────────────────────────────────────────────
say "Restarting $SERVICE_NAME ..."
systemctl restart "$SERVICE_NAME"
if ! healthy; then restore; fail "the service did not come up healthy on the socket; restored."; fi
say "The site is running with no database password in deploy.env."

# ── 5. The password itself ────────────────────────────────────────────────────
read -r -p "Remove the password from database user $DB_USER too, so the old one stops working anywhere? [y/N] " answer
if [ "${answer:-n}" = y ] || [ "${answer:-n}" = Y ]; then
  pg "ALTER ROLE \"$DB_USER\" PASSWORD NULL" >/dev/null
  say "Done: $DB_USER has no password. You still get in as yourself on the server: sudo -u postgres psql $DB_NAME"
fi
# The saved deploy.env still holds the old password; nothing needs it now.
shred -u "$SAVE/deploy.env" 2>/dev/null || rm -f "$SAVE/deploy.env"
say "Finished. pg_hba.conf and pg_ident.conf as they were before are in $SAVE"
