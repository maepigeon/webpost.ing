#!/usr/bin/env bash
# run-local.sh — build what is checked out and run it on this computer.
#
#     ./tools/run-local.sh          build, start, and open it in the browser
#     ./tools/run-local.sh stop     stop it
#     ./tools/run-local.sh status   say whether it is running
#
# The site is at http://localhost:5174 (the built website, served the way
# nginx serves it in production), talking to the server on port 8090 and the
# local database (testdb unless DB_NAME says otherwise; see
# guide/CONFIGURATION.md). Uploads and logs are kept outside the repository,
# so they survive rebuilds: ~/Library/Application Support/webposting-local on a
# Mac, ~/.local/share/webposting-local on Linux, %LOCALAPPDATA%\webposting-local
# on Windows (WEBPOSTING_LOCAL_DIR overrides).
#
# Runs in bash on macOS, Linux and Windows (Git for Windows' Git Bash).
# Needs: Java 21, Node 20.19 or later, and a running local Postgres.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
case "$(uname -s)" in
  Darwin) OS=mac;     DATA_DEFAULT="$HOME/Library/Application Support/webposting-local" ;;
  # cygpath -m gives C:/Users/..., which bash and java both understand.
  MINGW*|MSYS*|CYGWIN*) OS=windows
          DATA_DEFAULT="$(cygpath -m "${LOCALAPPDATA:-$HOME/AppData/Local}" 2>/dev/null || echo "$HOME/AppData/Local")/webposting-local" ;;
  *)      OS=linux;   DATA_DEFAULT="${XDG_DATA_HOME:-$HOME/.local/share}/webposting-local" ;;
esac
HOME_DIR="${WEBPOSTING_LOCAL_DIR:-$DATA_DEFAULT}"
SITE_PORT=5174
# Not 8080: other tools on a Mac (editors, proxies) often hold it.
API_PORT=8090
SITE="http://localhost:$SITE_PORT"

step() { echo; echo "── $* ──"; }
fail() { echo; echo "STOPPED: $*" >&2; exit 1; }
# Prints a pid (or "unknown") when something listens on port $1, else nothing.
# lsof on a Mac; ss or netstat where lsof is missing (Linux, Windows); a plain
# connection attempt as the last resort.
listening() {
  local port="$1" out
  if command -v lsof > /dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -1
  elif command -v ss > /dev/null 2>&1; then
    out="$(ss -ltnpH "sport = :$port" 2>/dev/null | head -1 || true)"
    [ -z "$out" ] || { sed -n 's/.*pid=\([0-9]*\).*/\1/p' <<< "$out" | head -1 | grep . || echo unknown; }
  elif [ "$OS" = windows ] && command -v netstat > /dev/null 2>&1; then
    netstat -ano -p tcp 2>/dev/null | awk -v p=":$port" '$4 == "LISTENING" && substr($2, length($2) - length(p) + 1) == p { print $5; exit }'
  elif command -v netstat > /dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk -v p=":$port" 'substr($4, length($4) - length(p) + 1) == p { print "unknown"; exit }'
  else
    (exec 3<> "/dev/tcp/127.0.0.1/$port") 2>/dev/null && echo unknown || true
  fi
}

# Stops $1 and what it started. Git Bash cannot signal Windows processes, so
# there it asks Windows (taskkill) with the process's Windows id.
kill_tree() {
  local pid="$1" winpid
  if [ "$OS" = windows ]; then
    winpid="$(ps -p "$pid" 2>/dev/null | awk 'NR == 2 { print $4 }')"
    taskkill //PID "${winpid:-$pid}" //T //F > /dev/null 2>&1 && return 0
  elif command -v pkill > /dev/null 2>&1; then
    pkill -P "$pid" 2>/dev/null || true   # anything it started
  fi
  kill "$pid" 2>/dev/null
}

# Opens $1 in the default browser. `open` only by name on a Mac: on Debian it
# is a different program.
open_url() {
  case "$OS" in
    mac) command -v open > /dev/null && open "$1" ;;
    windows) cmd.exe //c start "" "$1" > /dev/null 2>&1 ;;
    *) if command -v xdg-open > /dev/null 2>&1; then xdg-open "$1" > /dev/null 2>&1 &
       elif command -v wslview > /dev/null 2>&1; then wslview "$1" > /dev/null 2>&1
       else echo "Open $1 in your browser."; fi ;;
  esac
}

stop() {
  for name in server site; do
    if [ -f "$HOME_DIR/$name.pid" ]; then
      pid="$(cat "$HOME_DIR/$name.pid")"
      kill_tree "$pid" && echo "Stopped the $name (pid $pid)." || true
      rm -f "$HOME_DIR/$name.pid"
    fi
  done
}

case "${1:-start}" in
  stop) stop; exit 0 ;;
  status)
    if [ -n "$(listening $SITE_PORT)" ] && [ -n "$(listening $API_PORT)" ]; then echo "Running at $SITE"; else echo "Not running."; fi
    exit 0 ;;
  start) ;;
  -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
  *) echo "Unknown option: $1 (try --help)"; exit 2 ;;
esac

mkdir -p "$HOME_DIR/uploads"
stop
[ -z "$(listening $API_PORT)" ] || fail "something else is using port $API_PORT (pid $(listening $API_PORT)). Stop it and try again."
[ -z "$(listening $SITE_PORT)" ] || fail "something else is using port $SITE_PORT (pid $(listening $SITE_PORT)). Stop it and try again."

cd "$ROOT"
step "Building $(git rev-parse --short HEAD) on $(git rev-parse --abbrev-ref HEAD)"
(cd server && ./mvnw -q -DskipTests package) || fail "the server did not build."
JAR="$(ls server/target/*.jar | grep -v original | head -1)"
[ -d client/node_modules ] || (cd client && npm ci)
(cd client && npm run build --silent) || fail "the website did not build."

step "Starting"
APP_PROFILE=dev SERVER_PORT=$API_PORT ALLOWED_ORIGINS="$SITE" UPLOAD_DIR="$HOME_DIR/uploads" \
  nohup java -jar "$JAR" > "$HOME_DIR/server.log" 2>&1 < /dev/null &
echo $! > "$HOME_DIR/server.pid"
# vite itself, not through npm, so the recorded pid is the one to stop.
(cd client && API_PORT=$API_PORT nohup ./node_modules/.bin/vite preview > "$HOME_DIR/site.log" 2>&1 < /dev/null & echo $! > "$HOME_DIR/site.pid")

for _ in $(seq 1 60); do
  curl -fs "http://127.0.0.1:$API_PORT/api/health" > /dev/null 2>&1 && break
  kill -0 "$(cat "$HOME_DIR/server.pid")" 2>/dev/null || fail "the server stopped while starting. See $HOME_DIR/server.log"
  sleep 1
done
curl -fs "http://127.0.0.1:$API_PORT/api/health" > /dev/null 2>&1 || fail "the server did not answer in a minute. See $HOME_DIR/server.log"

echo "Running at $SITE  (stop with: ./tools/run-local.sh stop)"
[ -n "${NO_OPEN:-}" ] || open_url "$SITE" || true
