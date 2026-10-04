#!/usr/bin/env bash
# release.sh — test, build and ship webpost.ing from YOUR computer.
#
#     ./tools/release.sh              test, build, upload, install (asks for passwords)
#     ./tools/release.sh --no-install test, build, upload; install later by hand
#     ./tools/release.sh --build-only test and build the release archive, nothing more
#     ./tools/release.sh --skip-tests skip the test suites (emergencies only)
#
# Everything heavy happens here, never on the server: the server has 2 GB of
# memory, and building on it crashed it on 2026-09-30.
#
# Steps:
#   1. run the server tests (needs the local webposting_test database, see
#      guide/MIGRATIONS.md) and the client tests
#   2. build the website (client/dist) and the server JAR
#   3. pack them, with install-release.sh and server-start.sh, into
#      release/webposting-<date>-<commit>.tar.gz
#   4. upload it to the server's ~/incoming (over ssh; asks for your SSH
#      password once, for this and the next step)
#   5. unpack it there and run its install.sh with sudo (asks for your sudo
#      password). That backs up the database, JAR, start script and website,
#      swaps in the new ones, restarts, checks /api/health, and rolls back
#      if it fails.
#
# Nothing here talks to GitHub, and neither does the server: the release is
# built on this computer and uploaded over ssh.
#
# Settings: release.env in the repository root (not in git; copy
# config/release.env.example). Nothing about the server is written in this
# script or anywhere else in the repository. It is private now, but private
# repositories get cloned to laptops and may be opened again:
#   DEPLOY_HOST    ssh destination, user@host
#   SERVER_ENV     where deploy.env is on the server
#   DEPLOY_INBOX   upload directory there, in your home (default incoming)
#
# Needs: Java 21, Node 20.19 or later, and git. Runs in bash on macOS, Linux
# and Windows (Git Bash); on Windows ssh asks for the password at every step,
# because Git's ssh cannot share one connection.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/release.env" ] && { set -a; . "$ROOT/release.env"; set +a; }
DEPLOY_INBOX="${DEPLOY_INBOX:-incoming}"
TESTS=1 UPLOAD=1 INSTALL=1
for arg in "$@"; do
  case "$arg" in
    --skip-tests) TESTS=0 ;;
    --no-install) INSTALL=0 ;;
    --build-only) UPLOAD=0; INSTALL=0 ;;
    -h|--help) sed -n '2,38p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)"; exit 2 ;;
  esac
done

step() { echo; echo "── $* ──"; }
fail() { echo; echo "STOPPED: $*" >&2; exit 1; }

if [ "$UPLOAD" = 1 ] && { [ -z "${DEPLOY_HOST:-}" ] || [ -z "${SERVER_ENV:-}" ]; }; then
  fail "set DEPLOY_HOST and SERVER_ENV in release.env (cp config/release.env.example release.env), or use --build-only."
fi

cd "$ROOT"
COMMIT="$(git rev-parse --short HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
NAME="webposting-$(date +%Y%m%d-%H%M)-$COMMIT"

step "Release $NAME (branch $BRANCH)"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Warning: there are uncommitted changes; they will be in this release"
  echo "but not in git. Commit them first if this is a real release."
fi

# ── 1. Test ───────────────────────────────────────────────────────────────────
if [ "$TESTS" = 1 ]; then
  step "1/5 Server tests"
  (cd server && ./mvnw -q clean test) || fail "server tests failed (see server/target/surefire-reports)."
  step "1/5 Client tests"
  (cd client && npm ci --no-audit --no-fund --silent && npx vitest run) || fail "client tests failed."
else
  step "1/5 Tests SKIPPED (--skip-tests)"
  (cd client && npm ci --no-audit --no-fund --silent)
fi

# ── 2. Build ──────────────────────────────────────────────────────────────────
step "2/5 Build"
# Choco Cooky is part of the site but not of git (see guide/DEPLOYMENT.md).
[ -f client/public/fonts/Chococooky.woff2 ] \
  || fail "client/public/fonts/Chococooky.woff2 is missing; see guide/DEPLOYMENT.md, Choco Cooky."
(cd client && npm run build) || fail "website build failed."
# `clean` matters: an incremental build can leave a stale class behind and
# produce a JAR that fails at runtime.
(cd server && ./mvnw -q clean package -DskipTests) || fail "server build failed."

# ── 3. Pack ───────────────────────────────────────────────────────────────────
step "3/5 Pack"
OUT="$ROOT/release/$NAME"
rm -rf "$OUT"
mkdir -p "$OUT"
cp server/target/server-0.0.1-SNAPSHOT.jar "$OUT/server.jar"
# The start script (JVM memory flags) is installed next to the live one.
[ -f server-start.sh ] || fail "server-start.sh is missing from the repository root."
bash -n server-start.sh || fail "server-start.sh has a syntax error."
cp server-start.sh "$OUT/server-start.sh"
cp -R client/dist "$OUT/html"
cp tools/install-release.sh "$OUT/install.sh"
# One-off server scripts travel with every release, so they are at hand.
mkdir -p "$OUT/server-tools" && cp tools/server/*.sh "$OUT/server-tools/"
cp tools/backup.sh "$OUT/server-tools/"
printf '%s\ncommit %s (%s)\nbuilt %s on %s\n' "$NAME" "$(git rev-parse HEAD)" "$BRANCH" "$(date)" "$(hostname)" > "$OUT/RELEASE"
tar -czf "$ROOT/release/$NAME.tar.gz" -C "$ROOT/release" "$NAME"
echo "Built release/$NAME.tar.gz ($(du -h "$ROOT/release/$NAME.tar.gz" | cut -f1))"

if [ "$UPLOAD" = 0 ]; then
  echo; echo "Done (--build-only). Nothing was uploaded."
  exit 0
fi

# ── 4. Upload ─────────────────────────────────────────────────────────────────
step "4/5 Upload to $DEPLOY_HOST:~/$DEPLOY_INBOX"
# One connection for every step below, so the SSH password is asked once
# rather than once per step. It closes when the script ends.
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) SSH_OPTS=(-o ServerAliveInterval=30) ;;   # no connection sharing on Windows
  *)
    SSH_SOCKET="$(mktemp -d)/ssh"
    SSH_OPTS=(-o ControlMaster=auto -o "ControlPath=$SSH_SOCKET" -o ControlPersist=10m)
    trap 'ssh "${SSH_OPTS[@]}" -O exit "$DEPLOY_HOST" 2>/dev/null || true' EXIT ;;
esac
ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST" "mkdir -p ~/$DEPLOY_INBOX" || fail "could not log in to $DEPLOY_HOST."

# The archive goes down the ssh connection itself (not scp, which needs the
# server's file-transfer service), and its size is checked on arrival.
SIZE="$(wc -c < "$ROOT/release/$NAME.tar.gz" | tr -d ' ')"
echo "Sending $NAME.tar.gz ($((SIZE / 1048576)) MB) ..."
ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST" "cat > ~/$DEPLOY_INBOX/$NAME.tar.gz" < "$ROOT/release/$NAME.tar.gz" \
  || fail "the upload did not finish. ssh's own message is just above: 'No space left' means the server's disk is full; 'Permission denied' means the password or the folder's permissions."
ARRIVED="$(ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST" "wc -c < ~/$DEPLOY_INBOX/$NAME.tar.gz" | tr -d ' ')"
[ "$ARRIVED" = "$SIZE" ] || fail "only $ARRIVED of $SIZE bytes arrived. The server's disk may be full (check with: df -h ~)."
ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST" "cd ~/$DEPLOY_INBOX && tar -xzf $NAME.tar.gz" || fail "unpacking on the server failed."

INSTALL_CMD="sudo bash ~/$DEPLOY_INBOX/$NAME/install.sh --env $SERVER_ENV"
if [ "$INSTALL" = 0 ]; then
  echo; echo "Uploaded. To put it live, on the server run:"
  echo "    $INSTALL_CMD"
  echo "(add --dry-run first to see what it will do)"
  exit 0
fi

# ── 5. Install ────────────────────────────────────────────────────────────────
step "5/5 Install (your sudo password on the server)"
ssh -t "${SSH_OPTS[@]}" "$DEPLOY_HOST" "$INSTALL_CMD" || fail "install did not complete; it has rolled back if it got as far as the swap. Its output is above."
echo; echo "Released $NAME."
