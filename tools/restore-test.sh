#!/usr/bin/env bash
# restore-test.sh — prove a backup restores. Run it on YOUR computer, never on
# the server.
#
#     ./tools/restore-test.sh                  the newest download in ~/webposting-backups
#     ./tools/restore-test.sh <folder>         a downloaded backup folder (tools/download-backup.sh)
#     ./tools/restore-test.sh <file.dump>      one dump
#     ./tools/restore-test.sh --uploads DIR    also check uploaded files against DIR
#     ./tools/restore-test.sh --keep           leave the scratch database for a look
#
# "A backup that has never been restored is a hope, not a backup." This
# restores the dump into a scratch database, webposting_restore_test, on this
# computer's own PostgreSQL (dropped and re-created each time, and nothing
# else is touched), then checks:
#   1. the dump reads back and restores with no errors
#   2. the tables the app needs are there, with their row counts
#   3. there are users (a restore that "worked" but is empty is a failure)
#   4. a random sample of the upload rows (up to 25 uploads and 25 resized
#      copies) have their files: in the uploads_*.tar next to the dump, or in
#      the folder given with --uploads
# and ends with PASS or FAIL (exit status 0 or 1).
#
# Afterwards, to see the restored site with your own eyes, run the local build
# with DB_NAME=webposting_restore_test (see guide/WORKING-HERE.md) and
# `node tools/smoke/run.mjs` against it: use --keep so the database stays.
#
# Settings (environment): BACKUP_DIR (where downloads are, default
# ~/webposting-backups). PostgreSQL is reached as PGHOST/PGUSER/PGPORT say,
# default your own account over the local socket.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRATCH="webposting_restore_test"
LOCAL_DIR="${BACKUP_DIR:-$HOME/webposting-backups}"
INPUT="" UPLOADS_DIR="" KEEP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --uploads) UPLOADS_DIR="${2:-}"; shift ;;
    --keep) KEEP=1 ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    -*) echo "Unknown option: $1 (try --help)"; exit 2 ;;
    *) INPUT="$1" ;;
  esac
  shift
done

say()  { echo "[$(date +%H:%M:%S)] $*"; }
note() { echo "    $*"; }
PROBLEMS=""
problem() { PROBLEMS="${PROBLEMS}  - $*"$'\n'; }
stop() { echo; echo "STOPPED: $*" >&2; exit 2; }

# ── Never on the server ───────────────────────────────────────────────────────
# A restore drops and creates a database; on the server that is the one place
# it must not run. Refuse when any sign of production is here.
[ "$(id -u)" != 0 ] || stop "do not run this as root; it is for your own computer."
case "${PGHOST:-}" in ''|localhost|127.0.0.1|::1|/*) ;; *) stop "PGHOST=$PGHOST is not this computer; the restore test only runs on your own PostgreSQL." ;; esac
if [ -f "$ROOT/deploy.env" ] && grep -qE '^APP_PROFILE=prod' "$ROOT/deploy.env"; then
  stop "this checkout has a production deploy.env; the restore test is for your own computer, not the server."
fi
for t in psql pg_restore createdb dropdb; do command -v "$t" >/dev/null 2>&1 || stop "$t is not installed (PostgreSQL's command-line tools)."; done
psql -XAtq -d postgres -c 'select 1' >/dev/null 2>&1 || stop "cannot connect to your local PostgreSQL (is it running?)."

# ── Which dump ────────────────────────────────────────────────────────────────
newest() {  # newest file in $1 matching the glob $2
  ls -1 "$1" 2>/dev/null | grep -E "$2" | sort | tail -1
}
if [ -z "$INPUT" ]; then
  d="$(ls -1 "$LOCAL_DIR" 2>/dev/null | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}(_[0-9]{4})?$' | sort | tail -1 || true)"
  if [ -n "$d" ]; then INPUT="$LOCAL_DIR/$d"
  elif [ -d "$ROOT/backups" ]; then INPUT="$ROOT/backups"
  else stop "no backup given and none in $LOCAL_DIR; run tools/download-backup.sh first."; fi
fi
if [ -d "$INPUT" ]; then
  f="$(newest "$INPUT" '^db_[0-9]{8}_[0-9]{6}\.dump$')"
  [ -n "$f" ] || stop "no db_*.dump in $INPUT."
  DUMP="$INPUT/$f"
elif [ -f "$INPUT" ]; then DUMP="$INPUT"
else stop "$INPUT is not a folder or a file."; fi
FOLDER="$(cd "$(dirname "$DUMP")" && pwd)"
STAMP="$(basename "$DUMP" .dump)"; STAMP="${STAMP#db_}"
UPTAR=""
for c in "$FOLDER/uploads_$STAMP.tar" "$FOLDER/uploads_$STAMP.tar.gz"; do [ -f "$c" ] && UPTAR="$c" && break; done

say "Restore test of $DUMP ($(du -h "$DUMP" | cut -f1))"
if [ -n "$UPLOADS_DIR" ]; then note "uploaded files: checked against $UPLOADS_DIR"
elif [ -n "$UPTAR" ]; then note "uploaded files: checked against $(basename "$UPTAR")"
else note "uploaded files: not checked (no uploads_$STAMP.tar beside the dump, no --uploads DIR)"; fi

# ── 1. Restore ────────────────────────────────────────────────────────────────
pg_restore --list "$DUMP" >/dev/null 2>&1 || stop "$DUMP is not a readable pg_restore archive."
say "Restoring into the scratch database $SCRATCH (re-created) ..."
dropdb --if-exists "$SCRATCH" 2>/dev/null
createdb "$SCRATCH"
LOG="$(mktemp)"
trap 'rm -f "$LOG"; [ "$KEEP" = 1 ] || dropdb --if-exists "$SCRATCH" >/dev/null 2>&1 || true' EXIT
# The server's database owner and roles do not exist here, so ownership and
# grants are left out; everything else comes back.
pg_restore --no-owner --no-privileges -d "$SCRATCH" "$DUMP" 2> "$LOG" || true
ERRORS="$(grep -c 'error:' "$LOG" || true)"
if [ "$ERRORS" != 0 ]; then
  problem "pg_restore reported $ERRORS error(s); the first ones:"
  grep 'error:' "$LOG" | head -5 | sed 's/^/        /'
  grep -qi 'extension' "$LOG" && note "An 'extension' error usually means this computer's PostgreSQL lacks a module the server has; that is a gap here, not in the backup."
else
  note "restored with no errors."
fi

# ── 2 and 3. Tables and rows ──────────────────────────────────────────────────
sql() { psql -XAtq -d "$SCRATCH" -c "$1"; }
say "Tables and rows:"
for t in users posts uploads upload_variants post_uploads comments follows; do
  if [ "$(sql "select to_regclass('public.$t') is not null")" = t ]; then
    printf '      %-18s %s\n' "$t" "$(sql "select count(*) from public.$t")"
  else
    problem "table $t is missing."
  fi
done
USERS="$(sql "select count(*) from public.users" 2>/dev/null || echo 0)"
[ "${USERS:-0}" -gt 0 ] || problem "the restored database has no users."
LATEST="$(sql "select version from schema_migrations order by version desc limit 1" 2>/dev/null || true)"
HIGHEST="$(ls -1 "$ROOT/server/src/main/resources/db/migrations" 2>/dev/null | sed -n 's/^\(V[0-9]*\)__.*/\1/p' | sort | tail -1 || true)"
if [ -z "$LATEST" ]; then problem "schema_migrations is empty or missing."
else
  note "schema is at ${LATEST%%__*}$([ -n "$HIGHEST" ] && echo "; this checkout's newest migration is $HIGHEST (the app applies newer ones when it starts)")"
fi

# ── 4. Uploaded files ─────────────────────────────────────────────────────────
SAMPLE="$(sql "(select filename from public.uploads order by random() limit 25) union all (select filename from public.upload_variants order by random() limit 25)" 2>/dev/null || true)"
if [ -z "$SAMPLE" ]; then
  note "no upload rows to check."
elif [ -n "$UPLOADS_DIR" ]; then
  MISSING=0 N=0
  while IFS= read -r f; do N=$((N + 1)); [ -f "$UPLOADS_DIR/$f" ] || MISSING=$((MISSING + 1)); done <<< "$SAMPLE"
  note "uploaded files: $((N - MISSING)) of $N sampled rows have their file in $UPLOADS_DIR."
  [ "$MISSING" = 0 ] || problem "$MISSING of $N sampled upload rows have no file in $UPLOADS_DIR."
elif [ -n "$UPTAR" ]; then
  LIST="$(mktemp)"
  tar tf "$UPTAR" 2>/dev/null | sed 's|^[^/]*/||' > "$LIST" || problem "the uploads archive $(basename "$UPTAR") cannot be listed."
  MISSING=0 N=0
  while IFS= read -r f; do N=$((N + 1)); grep -Fxq -- "$f" "$LIST" || MISSING=$((MISSING + 1)); done <<< "$SAMPLE"
  rm -f "$LIST"
  note "uploaded files: $((N - MISSING)) of $N sampled rows have their file in $(basename "$UPTAR")."
  [ "$MISSING" = 0 ] || problem "$MISSING of $N sampled upload rows have no file in the archive."
fi

# ── Verdict ───────────────────────────────────────────────────────────────────
echo
if [ -z "$PROBLEMS" ]; then
  echo "PASS: $(basename "$DUMP") restores, with $USERS user(s)."
  [ "$KEEP" = 0 ] || echo "The scratch database $SCRATCH was kept: DB_NAME=$SCRATCH to run the app against it; dropdb $SCRATCH when done."
  exit 0
fi
echo "FAIL: $(basename "$DUMP")"
printf '%s' "$PROBLEMS"
exit 1
