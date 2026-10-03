#!/usr/bin/env bash
# deploy.sh — put what is checked out on GitHub and on the live site.
#
#     ./tools/deploy.sh
#
# In order, stopping at the first thing that goes wrong:
#   1. if there are uncommitted changes, shows them and asks whether to commit
#      them (and for a message); nothing ignored by .gitignore is ever added
#   2. pushes this branch to GitHub
#   3. runs tools/release.sh: tests, builds, uploads and installs on the
#      server. That asks for your SSH and sudo passwords; they are typed into
#      this terminal and go nowhere else.
#
# Releases are made from main. Settings are in release.env (see
# guide/DEPLOYMENT.md); nothing about the server is in this script.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

step() { echo; echo "── $* ──"; }
fail() { echo; echo "STOPPED: $*" >&2; exit 1; }

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "main" ] || fail "this checkout is on '$BRANCH'. Releases are made from main: git checkout main"
[ -f release.env ] || fail "there is no release.env here. Make one first: cp config/release.env.example release.env, then fill it in (guide/DEPLOYMENT.md)."

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

step "Releasing $(git rev-parse --short HEAD)"
exec "$ROOT/tools/release.sh"
