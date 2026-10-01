#!/usr/bin/env bash
# remove-stale-secrets.sh — find and delete leftover copies of credentials.
#
# Runs ON THE SERVER, as root:
#
#     sudo bash remove-stale-secrets.sh /path/to/deploy.env
#
# Looks for files that should not exist: old application*.properties files with
# a database login (from before settings moved to deploy.env), and bcrypt hash
# files. Under the app's directory and in people's home directories. Lists
# what it found and deletes it only when you say yes. deploy.env itself is
# never touched.

set -euo pipefail
ENV_FILE="${1:-}"
[ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ] || { echo "usage: sudo bash $0 /path/to/deploy.env"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "run this with sudo."; exit 1; }
APP_HOME="$(grep -E '^APP_HOME=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"
[ -n "$APP_HOME" ] || { echo "APP_HOME is not set in $ENV_FILE"; exit 1; }

mapfile -t found < <(
  { find "$APP_HOME" /home -xdev -type f -name 'application*.properties' -not -path '*/node_modules/*' 2>/dev/null \
      | xargs -r grep -lE 'datasource\.(password|username)\s*=' 2>/dev/null
    find /home /root -xdev -type f \( -name '*.bcrypt' -o -name '*.pgpass' -o -name '.pgpass' \) 2>/dev/null
  } | grep -vxF "$(readlink -f "$ENV_FILE")" | sort -u)

if [ "${#found[@]}" = 0 ]; then echo "Nothing found."; exit 0; fi
echo "These hold credentials or password hashes and are not needed:"
for f in "${found[@]}"; do echo "  $f ($(stat -c '%U, %s bytes' "$f"))"; done
echo
echo "Note: deleting a file does not change the password in it. Rotate any"
echo "password still in use (use-passwordless-db.sh removes the app's)."
read -r -p "Delete them? [y/N] " answer
[ "${answer:-n}" = y ] || [ "${answer:-n}" = Y ] || { echo "Nothing deleted."; exit 0; }
for f in "${found[@]}"; do shred -u "$f" 2>/dev/null || rm -f "$f"; echo "deleted $f"; done
