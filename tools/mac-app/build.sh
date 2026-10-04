#!/usr/bin/env bash
# build.sh — make Webposting.app, the small Mac menu for this repository and,
# if asked, for webpaint.ing too.
#
#     ./tools/mac-app/build.sh                         into ~/Applications
#     ./tools/mac-app/build.sh /some/dir               into that folder
#     ./tools/mac-app/build.sh --webpaint ~/workspace/webpainting
#                                                      one app, with a row that
#                                                      switches between the sites
#
# The app points at the checkout this script is run from. Run it again after
# moving either repository. Built without --webpaint, the app has no switch
# row and serves webpost.ing only.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="$HOME/Applications"
PAINT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --webpaint)
      [ $# -ge 2 ] || { echo "STOPPED: --webpaint needs the path to the webpaint.ing checkout" >&2; exit 1; }
      PAINT="$2"; shift 2 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    -*) echo "STOPPED: unknown option $1" >&2; exit 1 ;;
    *) DEST="$1"; shift ;;
  esac
done

if [ -n "$PAINT" ]; then
  [ -d "$PAINT" ] || { echo "STOPPED: there is no folder at $PAINT" >&2; exit 1; }
  PAINT="$(cd "$PAINT" && pwd)"
  # No button may do nothing: the webpaint.ing rows need these two scripts.
  for s in tools/run-local.sh tools/deploy.sh; do
    [ -x "$PAINT/$s" ] || { echo "STOPPED: $PAINT has no $s; that checkout is not ready for the app" >&2; exit 1; }
  done
fi

# The paths go into AppleScript string literals through sed: escape what
# either would read as its own (\ and " for AppleScript; \, & and | for sed).
literal() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/[\\&|]/\\&/g'; }

mkdir -p "$DEST"
SRC="$(mktemp -t webposting-app).applescript"
sed -e "s|__REPO__|$(literal "$ROOT")|" -e "s|__WEBPAINT__|$(literal "$PAINT")|" \
  "$ROOT/tools/mac-app/Webposting.applescript" > "$SRC"
rm -rf "$DEST/Webposting.app"
osacompile -o "$DEST/Webposting.app" "$SRC"
rm -f "$SRC"
if [ -n "$PAINT" ]; then
  echo "Built $DEST/Webposting.app (for $ROOT and $PAINT)"
else
  echo "Built $DEST/Webposting.app (for $ROOT)"
fi
