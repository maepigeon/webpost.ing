#!/usr/bin/env bash
# download-backup.sh — copy the newest backup from the server to YOUR computer.
#
#     ./tools/download-backup.sh              download the newest dump and the uploads
#     ./tools/download-backup.sh --list       show what is on the server, download nothing
#     ./tools/download-backup.sh --dry-run    say what would be downloaded, change nothing
#     ./tools/download-backup.sh --no-uploads only the database dump
#     ./tools/download-backup.sh --keep 20    keep the newest 20 downloads (default 10)
#
# This is the off-server copy of the backups: run it weekly and before anything
# risky (a release that changes the database, a server resize). The server
# makes a dump every night (tools/server/install-backup-timer.sh); this brings
# the newest one down, together with the uploaded files (images, avatars, fonts,
# audio) as they are right now, which a database dump does not contain.
#
# The files land in ~/webposting-backups/<date>/ (BACKUP_DIR changes that):
#     db_<stamp>.dump        the database (pg_restore reads it)
#     uploads_<stamp>.tar    the uploaded files
#     CHECKSUMS.txt          sha256 of both
# Check one with tools/restore-test.sh <that folder>.
#
# How: one ssh connection, shared (the password is asked once; where ssh cannot
# share a connection, as in Git Bash on Windows, it is asked per step). Both
# files are sent as a stream, and the server counts the bytes and takes a sha256
# of what it sent while this side does the same of what arrived; both must
# match. Then the dump is read with pg_restore --list and the tar is listed,
# where those tools exist here. The server does no more than read files, at the
# lowest priority.
#
# Settings: release.env in the repository root (like tools/release.sh; not in
# git), or the environment:
#   DEPLOY_HOST          ssh destination, user@host (required)
#   SERVER_BACKUP_DIR    where the server keeps dumps (default /var/backups/webposting)
#   SERVER_UPLOAD_DIR    the server's upload folder (default: what the server's
#                        nightly run recorded in its backup folder)
#   BACKUP_DIR           where to put downloads here (default ~/webposting-backups)
#   KEEP_DOWNLOADS       how many downloads to keep (default 10)
# The dumps are readable by your login without sudo. If something is not (an
# older install), this asks once for your sudo password on the server, types
# nothing anywhere else, and stores nothing.
#
# Works with bash on macOS, Linux, and Git Bash or WSL on Windows.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RELEASE_ENV="${RELEASE_ENV:-$ROOT/release.env}"
[ -f "$RELEASE_ENV" ] && { set -a; . "$RELEASE_ENV"; set +a; }
SERVER_BACKUP_DIR="${SERVER_BACKUP_DIR:-/var/backups/webposting}"
LOCAL_DIR="${BACKUP_DIR:-$HOME/webposting-backups}"
KEEP="${KEEP_DOWNLOADS:-10}"
LIST=0 DRY=0 UPLOADS=1
while [ $# -gt 0 ]; do
  case "$1" in
    --list) LIST=1 ;;
    --dry-run) DRY=1 ;;
    --no-uploads) UPLOADS=0 ;;
    --keep) KEEP="${2:-}"; shift ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)"; exit 2 ;;
  esac
  shift
done
case "$KEEP" in ''|*[!0-9]*) echo "--keep wants a number."; exit 2 ;; esac
[ "$KEEP" -ge 1 ] || { echo "--keep must be at least 1."; exit 2; }

say()  { echo "[$(date +%H:%M:%S)] $*"; }
note() { echo "    $*"; }
fail() { echo; echo "STOPPED: $*" >&2; exit 1; }
mb()   { if [ "$1" -lt 1048576 ]; then echo "$(( ($1 + 1023) / 1024 )) KB"; else echo "$(( ($1 + 1048575) / 1048576 )) MB"; fi; }
q()    { printf "'%s'" "$(printf %s "$1" | sed "s/'/'\\\\''/g")"; }   # shell-quote for the server

[ -n "${DEPLOY_HOST:-}" ] || fail "set DEPLOY_HOST in release.env (cp config/release.env.example release.env), then run this again."

sha256_of() {  # prints the hash, or nothing when this computer has no tool for it
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  elif command -v openssl >/dev/null 2>&1; then openssl dgst -sha256 -r "$1" | cut -d' ' -f1
  fi
}
size_of() { wc -c < "$1" | tr -d ' '; }

# ── One ssh connection ────────────────────────────────────────────────────────
SSH_TMP="$(mktemp -d)"
SSH_OPTS=(-o ConnectTimeout=20 -o ControlMaster=auto -o "ControlPath=$SSH_TMP/ssh" -o ControlPersist=10m)
cleanup() { ssh "${SSH_OPTS[@]}" -O exit "$DEPLOY_HOST" >/dev/null 2>&1 || true; rm -rf "$SSH_TMP"; }
trap cleanup EXIT
rssh() { ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST" "$@"; }

# ── What is on the server ─────────────────────────────────────────────────────
# Prints one line per fact:  DIR ok|no   DUMP name bytes epoch readable
#                            UPLOADS path kb readable   (path "-" when unknown)
PROBE='
dir=$1; up=$2
if ! cd "$dir" 2>/dev/null; then echo "DIR no"; exit 0; fi
echo "DIR ok"
for f in $(ls -1 | grep -E "^db_[0-9]{8}_[0-9]{6}\.dump\$" | sort); do
  r=no; [ -r "$f" ] && r=yes
  echo "DUMP $f $(wc -c < "$f" 2>/dev/null | tr -d " ") $(stat -c %Y "$f" 2>/dev/null || echo 0) $r"
done
if [ -z "$up" ] && [ -r where.env ]; then up=$(sed -n "s/^UPLOAD_DIR=//p" where.env | tail -1); fi
if [ -n "$up" ] && [ -d "$up" ]; then
  r=no; [ -r "$up" ] && [ -x "$up" ] && r=yes
  echo "UPLOADS $up $(du -sk "$up" 2>/dev/null | cut -f1) $r"
else
  echo "UPLOADS - 0 no"
fi'

SUDO_PW=""
ask_sudo() {
  [ -n "$SUDO_PW" ] && return 0
  echo "The server's backups need your sudo password to read (they are not readable by your login)."
  if ! { printf 'Password for sudo on %s (typed here, sent over ssh, stored nowhere): ' "$DEPLOY_HOST" > /dev/tty && IFS= read -r -s SUDO_PW < /dev/tty; } 2>/dev/null; then
    fail "that needs a password typed at a terminal; run this from a terminal window."
  fi
  echo > /dev/tty
}
# Run a command on the server; with $2 = sudo, as root through sudo -S.
rrun() {  # $1 command text, $2 "" or sudo
  if [ "${2:-}" = sudo ]; then
    printf '%s\n' "$SUDO_PW" | rssh "sudo -S -p '' bash -c $(q "$1")"
  else
    rssh "bash -c $(q "$1")" < /dev/null
  fi
}

say "Asking $DEPLOY_HOST what it has ..."
probe() {  # $1 "" or sudo
  rrun "set -- $(q "$SERVER_BACKUP_DIR") $(q "${SERVER_UPLOAD_DIR:-}"); $PROBE" "${1:-}"
}
PROBE_OUT="$(probe 2>"$SSH_TMP/err")" || { cat "$SSH_TMP/err" >&2; fail "could not log in to $DEPLOY_HOST (ssh's message is above)."; }
USE_SUDO=""
if printf '%s\n' "$PROBE_OUT" | grep -q '^DIR no'; then
  # Cannot even open the folder: ask again as root, which sees what is there.
  ask_sudo; USE_SUDO=sudo
  PROBE_OUT="$(probe sudo 2>"$SSH_TMP/err")" || { cat "$SSH_TMP/err" >&2; fail "sudo on the server did not work (wrong password?)."; }
fi
printf '%s\n' "$PROBE_OUT" | grep -q '^DIR ok' \
  || fail "there is no backup folder $SERVER_BACKUP_DIR on the server. Run tools/server/install-backup-timer.sh there first (guide/DEPLOYMENT.md section 6), or set SERVER_BACKUP_DIR in release.env."
DUMPS="$(printf '%s\n' "$PROBE_OUT" | grep '^DUMP ' || true)"
[ -n "$DUMPS" ] || fail "the server's backup folder $SERVER_BACKUP_DIR has no dump yet. The first one is made tonight, or run: sudo systemctl start webposting-backup.service"
NEWEST="$(printf '%s\n' "$DUMPS" | tail -1)"
D_NAME="$(echo "$NEWEST" | cut -d' ' -f2)"; D_SIZE="$(echo "$NEWEST" | cut -d' ' -f3)"; D_READ="$(echo "$NEWEST" | cut -d' ' -f5)"
UP_LINE="$(printf '%s\n' "$PROBE_OUT" | grep '^UPLOADS ' | tail -1)"
UP_DIR="$(echo "$UP_LINE" | cut -d' ' -f2)"; UP_KB="$(echo "$UP_LINE" | cut -d' ' -f3)"; UP_READ="$(echo "$UP_LINE" | cut -d' ' -f4)"
STAMP="${D_NAME#db_}"; STAMP="${STAMP%.dump}"
AGE_DAYS=""
D_EPOCH="$(echo "$NEWEST" | cut -d' ' -f4)"
[ "$D_EPOCH" -gt 0 ] 2>/dev/null && AGE_DAYS="$(( ($(date +%s) - D_EPOCH) / 86400 ))"

if [ "$LIST" = 1 ] || [ "$DRY" = 1 ]; then
  echo; echo "On the server ($SERVER_BACKUP_DIR), oldest first:"
  printf '%s\n' "$DUMPS" | while read -r _ name bytes epoch _; do
    when="$(date -d "@$epoch" '+%Y-%m-%d %H:%M' 2>/dev/null || date -r "$epoch" '+%Y-%m-%d %H:%M' 2>/dev/null || echo "$epoch")"
    printf '    %-28s %8s   %s\n' "$name" "$(mb "$bytes")" "$when"
  done
  if [ "$UP_DIR" != "-" ]; then note "uploads: $UP_DIR, $(mb $((UP_KB * 1024)))"
  else note "uploads: the server did not say where they are (set SERVER_UPLOAD_DIR in release.env)"; fi
  echo; echo "Already on this computer ($LOCAL_DIR):"
  found=0
  for d in $(ls -1 "$LOCAL_DIR" 2>/dev/null | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}(_[0-9]{4})?$' | sort || true); do
    found=1; printf '    %-18s %s\n' "$d" "$(du -sh "$LOCAL_DIR/$d" | cut -f1)"
  done
  [ "$found" = 1 ] || note "nothing yet."
fi
if [ "$LIST" = 1 ]; then exit 0; fi

[ -z "$AGE_DAYS" ] || [ "$AGE_DAYS" -le 2 ] || note "WARNING: the newest dump is $AGE_DAYS days old; has the nightly timer stopped? (systemctl status webposting-backup.timer)"

# ── Where it goes ─────────────────────────────────────────────────────────────
DAY="$(date +%Y-%m-%d)"
OUT="$LOCAL_DIR/$DAY"
[ ! -e "$OUT" ] || OUT="$LOCAL_DIR/${DAY}_$(date +%H%M)"
WANT_UP=0
if [ "$UPLOADS" = 1 ] && [ "$UP_DIR" != "-" ]; then WANT_UP=1; fi
NEED=$(( D_SIZE + UP_KB * 1024 * WANT_UP ))
[ "$DRY" = 1 ] || mkdir -p "$LOCAL_DIR" 2>/dev/null || fail "cannot create $LOCAL_DIR."
FREE_KB="$(df -Pk "$( [ -d "$LOCAL_DIR" ] && echo "$LOCAL_DIR" || echo "$HOME")" | awk 'NR==2 {print $4}')"
[ "$FREE_KB" -gt $(( NEED / 1024 * 12 / 10 )) ] || fail "not enough free space here: this needs about $(mb "$NEED") and $((FREE_KB / 1024)) MB is free."

echo
say "Will download into $OUT:"
note "$D_NAME ($(mb "$D_SIZE"))"
if [ "$WANT_UP" = 1 ]; then note "uploads_$STAMP.tar (about $(mb $((UP_KB * 1024))) of files from $UP_DIR)"
elif [ "$UPLOADS" = 1 ]; then note "uploads: skipped, the server did not say where they are (set SERVER_UPLOAD_DIR in release.env)"
else note "uploads: skipped (--no-uploads)"; fi
[ "$USE_SUDO" != sudo ] || note "reading as root through sudo."
if [ "$DRY" = 1 ]; then echo; say "Dry run: nothing was downloaded or changed."; exit 0; fi

# ── Download and check ────────────────────────────────────────────────────────
mkdir -p "$OUT"
FAILED=1
trap 'rm -f "$OUT"/*.part 2>/dev/null; [ "$FAILED" = 0 ] || rmdir "$OUT" 2>/dev/null || true; cleanup' EXIT

# $1 producer command on the server, $2 local file, $3 sudo-or-empty.
# The server counts and hashes what it sends (reported on stderr as WPSIZE= and
# WPSHA256=); this side does the same of what arrived.
fetch() {
  local producer="$1" file="$2" sudo="$3" err="$SSH_TMP/stream.err" rsha rsize lsha lsize
  rrun "$producer | tee >(sha256sum | sed 's/^/WPSHA256=/' >&2) >(wc -c | sed 's/^/WPSIZE=/' >&2)" "$sudo" > "$file.part" 2> "$err" \
    || { grep -v '^WP' "$err" >&2 || true; fail "the transfer of $(basename "$file") did not finish."; }
  grep -v '^WP' "$err" | head -5 | sed 's/^/    server said: /' || true
  rsha="$(sed -n 's/^WPSHA256=//p' "$err" | tail -1 | cut -d' ' -f1)"
  rsize="$(sed -n 's/^WPSIZE=//p' "$err" | tail -1 | tr -d ' ')"
  lsize="$(size_of "$file.part")"; lsha="$(sha256_of "$file.part")"
  [ -n "$rsize" ] && [ "$lsize" = "$rsize" ] || fail "$(basename "$file"): $lsize bytes arrived, the server sent ${rsize:-?}. Run this again."
  if [ -z "$lsha" ]; then note "no sha256 tool on this computer; only the size was compared."
  elif [ "$lsha" != "$rsha" ]; then fail "$(basename "$file"): the checksum differs from what the server sent. Run this again."
  fi
  mv "$file.part" "$file"
  echo "$lsha  $(basename "$file")" >> "$OUT/CHECKSUMS.txt"
  note "$(basename "$file"): $(mb "$lsize"), size${lsha:+ and sha256} match the server."
}

say "Database dump ..."
DUMP_SUDO="$USE_SUDO"; [ "$D_READ" = yes ] || DUMP_SUDO=sudo
[ "$DUMP_SUDO" != sudo ] || ask_sudo
fetch "cat $(q "$SERVER_BACKUP_DIR/$D_NAME")" "$OUT/$D_NAME" "$DUMP_SUDO"
if command -v pg_restore >/dev/null 2>&1; then
  pg_restore --list "$OUT/$D_NAME" >/dev/null 2>&1 || fail "$D_NAME does not read back with pg_restore --list. Do not rely on it; run this again."
  note "pg_restore reads the dump."
else
  note "pg_restore is not installed here; the dump was not read back (the checksum matched)."
fi

if [ "$WANT_UP" = 1 ]; then
  say "Uploads (the server reads $UP_DIR once, at lowest priority) ..."
  UP_SUDO="$USE_SUDO"; [ "$UP_READ" = yes ] || UP_SUDO=sudo
  [ "$UP_SUDO" != sudo ] || ask_sudo
  PARENT="$(dirname "$UP_DIR")"; BASE="$(basename "$UP_DIR")"
  fetch "nice -n 19 tar cf - -C $(q "$PARENT") $(q "$BASE")" "$OUT/uploads_$STAMP.tar" "$UP_SUDO"
  tar tf "$OUT/uploads_$STAMP.tar" > "$SSH_TMP/tar.list" 2>/dev/null || fail "uploads_$STAMP.tar is not a readable tar. Run this again."
  note "$(grep -vc '/$' "$SSH_TMP/tar.list" || true) files in the tar."
fi

FAILED=0

# ── Keep the newest few ───────────────────────────────────────────────────────
# Only folders named like a download that contain a dump are ever removed.
KEPT=0 REMOVED=0
for d in $(ls -1 "$LOCAL_DIR" | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}(_[0-9]{4})?$' | sort -r); do
  if ! ls "$LOCAL_DIR/$d"/db_*.dump >/dev/null 2>&1; then continue; fi
  KEPT=$((KEPT + 1))
  if [ "$KEPT" -gt "$KEEP" ]; then rm -rf "${LOCAL_DIR:?}/$d"; REMOVED=$((REMOVED + 1)); fi
done
[ "$REMOVED" = 0 ] || note "removed $REMOVED older download(s); the newest $KEEP are kept."

echo
echo "=== Backup downloaded. ==="
echo "    $OUT"
ls -1 "$OUT" | while read -r f; do printf '      %-30s %s\n' "$f" "$(du -h "$OUT/$f" | cut -f1)"; done
echo "    total: $(du -sh "$OUT" | cut -f1); all downloads: $(du -sh "$LOCAL_DIR" | cut -f1) in $LOCAL_DIR"
echo "To prove it restores: tools/restore-test.sh $OUT"
