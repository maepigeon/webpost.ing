#!/usr/bin/env bash
# enable-mail.sh — turn on outgoing email for the app.
#
# Runs ON THE SERVER, as root:
#
#     sudo bash enable-mail.sh /path/to/deploy.env
#
# The app already knows how to send mail (address confirmation, password
# reset, notifications: guide/EMAIL.md); it only needs to be told which mail
# service to send through. This asks for that service's SMTP details, typed
# here on the server so they are never in the repository or a chat, writes
# them to deploy.env, restarts the app and checks it is healthy. If it is not,
# deploy.env is put back as it was and the app restarted.
#
# You need an account with a mail-sending service first (for example Amazon
# SES, Postmark, Mailgun, Brevo or Fastmail SMTP) and its DNS records (SPF,
# DKIM, and a DMARC record) added for your domain, or mail will go to spam.
# Running this again lets you change the details.

set -euo pipefail
ENV_FILE="${1:-}"
say()  { echo "[$(date +%H:%M:%S)] $*"; }
fail() { echo; echo "FAILED: $*" >&2; exit 1; }
[ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ] || fail "usage: sudo bash $0 /path/to/deploy.env"
[ "$(id -u)" = 0 ] || fail "run this with sudo."

get() { { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e "s/^['\"]//" -e "s/['\"]\$//"; } || true; }
SERVICE_NAME="$(get SERVICE_NAME)"; PORT="$(get SERVER_PORT)"; PORT="${PORT:-8080}"
[ -n "$SERVICE_NAME" ] || fail "SERVICE_NAME is not set in $ENV_FILE"

ask() {   # ask NAME "question" [default]
  local answer; read -r -p "$2${3:+ [$3]}: " answer
  printf -v "$1" '%s' "${answer:-${3:-}}"
}
echo "Details from your mail service's SMTP settings page."
ask MAIL_HOST "SMTP server (like smtp.example.com)" "$(get MAIL_HOST)"
ask MAIL_PORT "Port" "$(get MAIL_PORT || true)"; MAIL_PORT="${MAIL_PORT:-587}"
ask MAIL_USERNAME "SMTP username" "$(get MAIL_USERNAME)"
read -r -s -p "SMTP password (not shown as you type): " MAIL_PASSWORD; echo
ask MAIL_FROM "Send as (an address at your domain, like no-reply@your-site)" "$(get MAIL_FROM)"
ask APP_BASE_URL "The site's address, for links in emails (https://…)" "$(get APP_BASE_URL)"
for v in MAIL_HOST MAIL_PORT MAIL_USERNAME MAIL_PASSWORD MAIL_FROM APP_BASE_URL; do [ -n "${!v}" ] || fail "$v is needed."; done
case "$APP_BASE_URL" in https://*) ;; *) fail "the site's address must start with https://";; esac

SAVE="/root/enable-mail-$(date +%Y%m%d_%H%M%S).env"
cp -p "$ENV_FILE" "$SAVE"; chmod 600 "$SAVE"

# Replace any earlier MAIL_* and APP_BASE_URL lines, keeping the file's owner and mode.
TMP="$(mktemp)"
grep -vE '^(MAIL_ENABLED|MAIL_HOST|MAIL_PORT|MAIL_USERNAME|MAIL_PASSWORD|MAIL_FROM|APP_BASE_URL)=' "$ENV_FILE" > "$TMP" || true
q() { printf "%s='%s'\n" "$1" "$(printf '%s' "$2" | sed "s/'/'\\\\''/g")"; }
{ echo "MAIL_ENABLED=true"; q MAIL_HOST "$MAIL_HOST"; q MAIL_PORT "$MAIL_PORT"; q MAIL_USERNAME "$MAIL_USERNAME"
  q MAIL_PASSWORD "$MAIL_PASSWORD"; q MAIL_FROM "$MAIL_FROM"; q APP_BASE_URL "$APP_BASE_URL"; } >> "$TMP"
cat "$TMP" > "$ENV_FILE"; rm -f "$TMP"

healthy() {
  for _ in $(seq 1 90); do
    curl -fs "http://127.0.0.1:$PORT/api/health" > /dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}
say "Restarting $SERVICE_NAME ..."
systemctl restart "$SERVICE_NAME"
if healthy; then
  say "Mail is on. In Settings, add your email address: a confirmation email should arrive within a minute."
  say "The previous deploy.env is kept at $SAVE (delete it once mail works)."
else
  say "The app did not come back; putting deploy.env back ..."
  cp -p "$SAVE" "$ENV_FILE"
  systemctl restart "$SERVICE_NAME"
  healthy || fail "the app is still not healthy. Look at: journalctl -u $SERVICE_NAME -n 100"
  fail "mail settings were not kept. The app is running as before. Look at: journalctl -u $SERVICE_NAME -n 100"
fi
