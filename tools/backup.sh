#!/usr/bin/env bash
# backup.sh — back up the database *and* the uploaded files.
#
#   ./tools/backup.sh [options] [destination-directory]
#
#   (no option)  by hand: one dump and one tar.gz of the uploads, same stamp
#   --nightly    the scheduled run (tools/server/install-backup-timer.sh):
#                  1. dump the database into BACKUP_DIR (read back to check it)
#                  2. prune old dumps: the newest of each of the last 7 days
#                     and of the last 4 weeks are kept
#                  3. note where the uploads are (BACKUP_DIR/where.env), and
#                     ping HEARTBEAT_URL if one is set, so a night that does
#                     not happen is noticed (and /fail when a step failed)
#                The uploads are not copied here: they are already on this
#                disk, a second copy would only fill it. tools/download-backup.sh,
#                run on the owner's computer, brings the dump and the uploads
#                off the server; that is the off-server copy.
#   --check      check every precondition, change nothing, say what is wrong
#   --dry-run    say what would be done, change nothing
#   --env FILE   settings file (default: deploy.env in the repo root)
#
# `pg_dump` alone is not a backup of this application. Images, avatars and fonts
# live on disk, so a database-only restore brings back every post with every
# image broken. A manual run takes both with matching stamps so a pair can be
# restored together; the download script pairs them the same way.
#
# Settings come from deploy.env (guide/CONFIGURATION.md); no new secret:
#   BACKUP_DIR            where dumps are kept (default: <repo>/backups)
#   HEARTBEAT_URL         a healthchecks.io-style ping URL (optional, free tier)
#   BACKUP_KEEP_DAILY / BACKUP_KEEP_WEEKLY   retention (default 7 and 4)
#
# Nothing here is heavy: one pg_dump at the lowest CPU and disk priority. It
# never builds or downloads anything.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${DEPLOY_ENV:-$REPO_ROOT/deploy.env}"
DEST_ARG=""
NIGHTLY=0 CHECK=0 DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --nightly) NIGHTLY=1 ;;
    --check) CHECK=1 ;;
    --dry-run) DRY=1 ;;
    --env) ENV_FILE="${2:-}"; shift ;;
    -*) echo "Unknown option: $1"; exit 2 ;;
    *) DEST_ARG="$1" ;;
  esac
  shift
done

if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
else
  echo "WARNING: no deploy.env; falling back to development defaults."
fi

DB_HOST="${DB_SOCKET:-${DB_HOST:-localhost}}"   # a socket directory works as -h
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-testdb}"
DB_USER="${DB_USER:-${USER:-}}"
UPLOAD_DIR="${UPLOAD_DIR:-$REPO_ROOT/server/uploads}"
UPLOAD_DIR="${UPLOAD_DIR%/}"
DEST="${DEST_ARG:-${BACKUP_DIR:-$REPO_ROOT/backups}}"
KEEP_DAILY="${BACKUP_KEEP_DAILY:-7}"
KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-4}"
STAMP="$(date +%Y%m%d_%H%M%S)"
# A dump holds every password hash: readable by its owner and group only
# (the folder's group is the deploy user's, so the download needs no sudo).
umask "${BACKUP_UMASK:-027}"

say()  { echo "[$(date +%H:%M:%S)] $*"; }
note() { echo "    $*"; }
fail() { echo; echo "FAILED: $*" >&2; exit 1; }
pgx()  { PGPASSWORD="${DB_PASSWORD:-}" "$@"; }
# Lowest CPU and disk priority where the system has them (ionice is Linux).
lowprio() {
  if command -v ionice >/dev/null 2>&1; then nice -n 19 ionice -c3 "$@"; else nice -n 19 "$@"; fi
}

# ── Heartbeat ─────────────────────────────────────────────────────────────────
# Only a nightly run pings, and only when it really ran (not --check/--dry-run).
# The URL is a secret of sorts: it is never printed.
ping_heartbeat() {  # $1 = "" for success, "/fail" for failure
  [ "$NIGHTLY" = 1 ] && [ "$CHECK" = 0 ] && [ "$DRY" = 0 ] && [ -n "${HEARTBEAT_URL:-}" ] || return 0
  if curl -fsS -m 15 --retry 3 -o /dev/null "${HEARTBEAT_URL%/}$1" 2>/dev/null; then
    note "heartbeat sent${1:+ ($1)}."
  else
    note "WARNING: the heartbeat could not be sent."
  fi
}
FINISHED=0
on_exit() {
  code=$?
  if [ "$code" != 0 ] && [ "$FINISHED" = 0 ]; then ping_heartbeat /fail; fi
}
trap on_exit EXIT

# A full disk stops PostgreSQL too, so refuse to dump without twice the
# database's size free (the dump itself is smaller; this is the margin).
check_space() {
  local need_kb free_kb dir="$DEST"
  [ -d "$dir" ] || dir="$(dirname "$dir")"
  need_kb="$(( $(pgx psql -XAtq -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c 'select pg_database_size(current_database())' 2>/dev/null || echo 0) / 512 ))"
  free_kb="$(df -Pk "$dir" | awk 'NR==2 {print $4}')"
  note "disk     : $((free_kb / 1024)) MB free for dumps, the database needs about $((need_kb / 2048)) MB"
  [ "$free_kb" -gt "$need_kb" ] || fail "not enough free disk in $dir for a dump (free $((free_kb / 1024)) MB, wanted $((need_kb / 1024)) MB). Free some space first."
}

check_all() {
  command -v pg_dump >/dev/null 2>&1 || fail "pg_dump is not installed."
  [ "$(pgx psql -XAtq -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c 'select 1' 2>&1)" = 1 ] \
    || fail "cannot connect to database $DB_NAME as $DB_USER on $DB_HOST:$DB_PORT."
  note "database : connects"
  if [ -d "$UPLOAD_DIR" ]; then note "uploads  : $UPLOAD_DIR readable ($(find "$UPLOAD_DIR" -type f | wc -l | tr -d ' ') files)"
  else fail "UPLOAD_DIR $UPLOAD_DIR does not exist."; fi
  if [ -d "$DEST" ]; then [ -w "$DEST" ] || fail "cannot write to $DEST."
  else mkdir -p "$DEST" 2>/dev/null || fail "cannot create $DEST."; fi
  note "into     : $DEST (writable)"
  check_space
}

echo "=== webpost.ing backup $STAMP ==="
echo "    database : $DB_NAME on $DB_HOST:$DB_PORT"
echo "    uploads  : $UPLOAD_DIR"
echo "    into     : $DEST"
[ "$NIGHTLY" = 1 ] && echo "    mode     : nightly (dump, prune; the uploads stay where they are)"
[ "$DRY" = 1 ] && echo "    DRY RUN: nothing will change."

if [ "$CHECK" = 1 ]; then
  check_all
  echo; echo "Everything this backup needs is in place."
  FINISHED=1; exit 0
fi

# Fail before changing anything. (A dry run still checks, but creates nothing.)
if [ "$DRY" = 0 ]; then
  check_all
else
  command -v pg_dump >/dev/null 2>&1 || fail "pg_dump is not installed."
fi
[ "$DRY" = 1 ] || mkdir -p "$DEST"

# ── Local retention ───────────────────────────────────────────────────────────
# ISO week of a date given as YYYYMMDD; GNU date on the server, BSD date on a Mac.
week_of() {
  date -d "${1:0:4}-${1:4:2}-${1:6:2}" +%G-%V 2>/dev/null \
    || date -j -f %Y%m%d "$1" +%G-%V
}

# Keep the newest dump of each of the last KEEP_DAILY days that have one and
# of the last KEEP_WEEKLY weeks that have one; delete the rest (with an
# uploads archive of the same stamp, if a manual run made one). Only files
# named exactly db_YYYYMMDD_HHMMSS.dump are ever touched.
prune_local() {
  local f base stamp day wk keep days="" weeks="" nd=0 nw=0 removed=0 list
  list="$(ls -1 "$DEST" 2>/dev/null | grep -E '^db_[0-9]{8}_[0-9]{6}\.dump$' | sort -r || true)"
  for base in $list; do
    stamp="${base#db_}"; stamp="${stamp%.dump}"; day="${stamp:0:8}"; keep=0
    case " $days " in *" $day "*) ;; *)
      if [ "$nd" -lt "$KEEP_DAILY" ]; then days="$days $day"; nd=$((nd + 1)); keep=1; fi ;;
    esac
    wk="$(week_of "$day")"
    case " $weeks " in *" $wk "*) ;; *)
      if [ "$nw" -lt "$KEEP_WEEKLY" ]; then weeks="$weeks $wk"; nw=$((nw + 1)); keep=1; fi ;;
    esac
    if [ "$keep" = 0 ]; then
      removed=$((removed + 1))
      if [ "$DRY" = 1 ]; then note "would delete $DEST/$base"
      else rm -f "$DEST/$base" "$DEST/uploads_$stamp.tar.gz"; fi
    fi
  done
  note "kept $nd daily and $nw weekly dump(s); $removed older one(s) $([ "$DRY" = 1 ] && echo "would go" || echo "deleted")."
}

# ── Database ──────────────────────────────────────────────────────────────────
DB_FILE="$DEST/db_$STAMP.dump"
STEPS=3
if [ "$DRY" = 1 ]; then
  echo "[1/$STEPS] would dump the database to $DB_FILE"
else
  echo "[1/$STEPS] Dumping the database..."
  # Written under a temporary name and renamed once it reads back, so pruning
  # and the download never see a half-written dump.
  rm -f "$DEST"/db_*.dump.partial
  pgx lowprio pg_dump -Fc -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" > "$DB_FILE.partial" \
    || { rm -f "$DB_FILE.partial"; fail "pg_dump failed."; }
  # An unreadable backup is worse than no backup, because you believe you have one.
  if [ -s "$DB_FILE.partial" ] && pg_restore --list "$DB_FILE.partial" > /dev/null 2>&1; then
    mv "$DB_FILE.partial" "$DB_FILE"
    note "$(du -h "$DB_FILE" | cut -f1) → $DB_FILE (reads back cleanly)"
  else
    rm -f "$DB_FILE.partial"
    fail "the dump could not be read back. Do not rely on it."
  fi
fi

# ── Uploaded files (manual runs only) ─────────────────────────────────────────
if [ "$NIGHTLY" = 0 ]; then
  UPLOADS_FILE="$DEST/uploads_$STAMP.tar.gz"
  echo "[2/$STEPS] Archiving uploads..."
  if [ "$DRY" = 1 ]; then
    note "would archive $UPLOAD_DIR to $UPLOADS_FILE"
  elif [ -d "$UPLOAD_DIR" ]; then
    tar czf "$UPLOADS_FILE" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"
    note "$(du -h "$UPLOADS_FILE" | cut -f1) → $UPLOADS_FILE"
    tar tzf "$UPLOADS_FILE" > /dev/null 2>&1 || fail "the uploads archive is corrupt."
  else
    note "WARNING: $UPLOAD_DIR does not exist; nothing archived."
  fi
fi

# ── Retention (nightly) ───────────────────────────────────────────────────────
if [ "$NIGHTLY" = 1 ]; then
  echo "[2/$STEPS] Pruning old dumps here..."
  prune_local
  # Tells tools/download-backup.sh where the uploads are (the dump's own
  # folder is all it is given). Plain text, readable like the dumps.
  if [ "$DRY" = 0 ]; then printf 'UPLOAD_DIR=%s\n' "$UPLOAD_DIR" > "$DEST/where.env"; fi
fi

echo "[$STEPS/$STEPS] Done."
FINISHED=1
[ "$DRY" = 1 ] && { echo; echo "Dry run complete."; exit 0; }
ping_heartbeat ""

echo ""
echo "=== Backup complete. ==="
echo "Restore with:"
echo "  pg_restore -c -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME $DB_FILE"
[ "$NIGHTLY" = 1 ] || echo "  tar xzf $UPLOADS_FILE -C $(dirname "$UPLOAD_DIR")"
echo "Copy it to your computer with tools/download-backup.sh, and prove it restores with tools/restore-test.sh (guide/DEPLOYMENT.md section 6)."
