#!/usr/bin/env bash
# webposting.sh — open the Webposting menu (macOS and Linux).
#
#     ./tools/webposting.sh            the menu
#     ./tools/webposting.sh deploy     one action: see `node tools/menu.mjs --help`
#
# Windows: double-click tools/webposting.cmd instead.

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
if ! command -v node > /dev/null 2>&1; then
  echo "Node.js is not installed. Install Node 20.19 or newer (https://nodejs.org), then run this again." >&2
  exit 1
fi
exec node tools/menu.mjs "$@"
