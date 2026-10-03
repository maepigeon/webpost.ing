#!/usr/bin/env bash
# deploy.sh — put what is checked out on GitHub and on the live site.
#
#     ./tools/deploy.sh             deploy
#     ./tools/deploy.sh --setup     ask for the server settings again
#
# In order, stopping at the first thing that goes wrong:
#   1. the first time, asks for the server login and where its deploy.env is,
#      and keeps the answers in release.env (gitignored; never in the repository)
#   2. if there are uncommitted changes, shows them and asks whether to commit
#      them (and for a message); nothing ignored by .gitignore is ever added
#   3. pushes main to GitHub
#   4. runs tools/release.sh: tests and builds on this computer, uploads the
#      finished release and installs it on the server. ssh asks for your
#      password in this terminal; it goes nowhere else.
#
# Advanced: DEPLOY_COMMAND in release.env, if set, is run on the server
# instead of step 4's upload (for a server that updates itself from GitHub).
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
looks_like_login() { [[ "$1" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; }
if [ "${1:-}" = "--setup" ] || ! looks_like_login "${DEPLOY_HOST:-}" || { [ -z "${DEPLOY_COMMAND:-}" ] && [ -z "${SERVER_ENV:-}" ]; }; then
  step "First-time setup: two facts about your server (saved on this Mac only)"
  echo "1. The login you use for ssh: your username on the server, an @, and the"
  echo "   server's address. Example: mae@example.com"
  while :; do
    read -r -p "   Login: " DEPLOY_HOST
    looks_like_login "$DEPLOY_HOST" && break
    echo "   That needs to look like name@address. Try again, or press Ctrl-C to stop."
  done
  keep DEPLOY_HOST "$DEPLOY_HOST"
  echo
  echo "2. The full path of the app's deploy.env file on the server."
  echo "   Example: /home/example/deploy.env"
  while :; do
    read -r -p "   Path: " SERVER_ENV
    [[ "$SERVER_ENV" == /* ]] && break
    echo "   That needs to start with a /. Try again, or press Ctrl-C to stop."
  done
  keep SERVER_ENV "$SERVER_ENV"
  echo
  echo "Saved. You will not be asked again (./tools/deploy.sh --setup to change them)."
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
