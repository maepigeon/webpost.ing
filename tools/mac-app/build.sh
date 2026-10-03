#!/usr/bin/env bash
# build.sh — make Webposting.app, the small Mac menu for this repository.
#
#     ./tools/mac-app/build.sh            into ~/Applications
#     ./tools/mac-app/build.sh /some/dir  into that folder
#
# The app points at the checkout this script is run from. Run it again after
# moving the repository.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="${1:-$HOME/Applications}"
mkdir -p "$DEST"
SRC="$(mktemp -t webposting-app).applescript"
sed "s|__REPO__|$ROOT|" "$ROOT/tools/mac-app/Webposting.applescript" > "$SRC"
rm -rf "$DEST/Webposting.app"
osacompile -o "$DEST/Webposting.app" "$SRC"
rm -f "$SRC"
echo "Built $DEST/Webposting.app (for $ROOT)"
