#!/usr/bin/env bash
# deploy.sh — put what is checked out on GitHub and on the live site.
#
#     ./tools/deploy.sh             deploy
#     ./tools/deploy.sh --setup     ask for the server settings again
#
# In order, stopping at the first thing that goes wrong:
#   1. the first time, asks where the server is and how it is updated, and
#      keeps the answers in release.env (gitignored; never in the repository)
#   2. if there are uncommitted changes, shows them and asks whether to commit
#      them (and for a message); nothing ignored by .gitignore is ever added
#   3. pushes main to GitHub
#   4. logs in to the server (ssh asks for your password in this terminal; it
#      goes nowhere else) and updates it, one of two ways:
#        - DEPLOY_COMMAND is set: runs that command on the server, which
#          downloads the latest from GitHub and deploys it there
#        - otherwise: tools/release.sh, which tests and builds on this
#          computer and uploads the finished release (guide/DEPLOYMENT.md)
#
# Nothing about the server is written in this script.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

step() { echo; echo "── $* ──"; }
fail() { echo; echo "STOPPED: $*" >&2; exit 1; }

# Adds or replaces one NAME='value' line in release.env.
keep() {
  touch release.env
  grep -v "^$1=" release.env > .release.tmp.env || true
  printf "%s='%s'\n" "$1" "$(printf '%s' "$2" | sed "s/'/'\\\\''/g")" >> .release.tmp.env
  mv .release.tmp.env release.env
}

[ -f release.env ] && { set -a; . ./release.env; set +a; }
if [ "${1:-}" = "--setup" ] || [ -z "${DEPLOY_HOST:-}" ]; then
  step "Server settings (kept in release.env on this computer only)"
  read -r -p "Server login, as user@host${DEPLOY_HOST:+ [$DEPLOY_HOST]}: " answer
  DEPLOY_HOST="${answer:-${DEPLOY_HOST:-}}"
  [ -n "$DEPLOY_HOST" ] || fail "a server login is needed, like you@example.com."
  keep DEPLOY_HOST "$DEPLOY_HOST"
  echo
  echo "How is the server updated? Type the command you run on the server to"
  echo "download the latest from GitHub and deploy it (for example: sudo bash"
  echo "/path/to/deploy.sh). Leave it empty to build on this computer and upload"
  echo "the finished release instead."
  read -r -p "Command on the server${DEPLOY_COMMAND:+ [$DEPLOY_COMMAND]}: " answer
  DEPLOY_COMMAND="${answer:-${DEPLOY_COMMAND:-}}"
  keep DEPLOY_COMMAND "$DEPLOY_COMMAND"
  if [ -z "$DEPLOY_COMMAND" ] && [ -z "${SERVER_ENV:-}" ]; then
    read -r -p "Where deploy.env is on the server (full path): " SERVER_ENV
    [ -n "$SERVER_ENV" ] || fail "release.sh needs to know where deploy.env is on the server."
    keep SERVER_ENV "$SERVER_ENV"
  fi
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "main" ] || fail "this checkout is on '$BRANCH'. Releases are made from main: git checkout main"

if [ -n "$(git status --porcelain)" ]; then
  step "Uncommitted changes"
  git status --short
  echo
  read -r -p "Commit all of these and release them? [y/N] " answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ] || fail "nothing was changed. Commit or put aside the changes, then deploy again."
  read -r -p "Commit message: " message
  [ -n "$message" ] || fail "a commit needs a message."
  git add -A
  git commit -m "$message"
fi

step "Pushing main to GitHub"
git pull --ff-only origin main || fail "GitHub has changes this checkout cannot simply take. Sort that out by hand, then deploy again."
git push origin main

if [ -n "${DEPLOY_COMMAND:-}" ]; then
  step "Updating the server to $(git rev-parse --short HEAD)"
  echo "Logging in to $DEPLOY_HOST. Type your password when asked."
  # -t gives the server a terminal, so sudo there can ask for its password.
  ssh -t "$DEPLOY_HOST" "$DEPLOY_COMMAND" || fail "the server's update did not finish. Read the messages above."
  echo
  echo "Done. Hard-refresh the site to see the new version."
else
  step "Releasing $(git rev-parse --short HEAD)"
  exec "$ROOT/tools/release.sh"
fi
