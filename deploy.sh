#!/usr/bin/env bash
# deploy.sh — build and publish webpost.ing on the production host.
#
#   ./deploy.sh              full deploy: build both, publish both, restart
#   ./deploy.sh --no-build   publish existing artifacts and restart
#   ./deploy.sh --dry-run    print what would happen, change nothing
#
# All environment-specific values come from deploy.env in the repo root; see
# config/deploy.env.example and guide/CONFIGURATION.md. There are no paths,
# database names or credentials hard-coded here.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$REPO_ROOT/deploy.env"

# ── Configuration ─────────────────────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
  echo "Loaded configuration from deploy.env"
else
  echo "ERROR: $ENV_FILE not found."
  echo "       cp config/deploy.env.example deploy.env && \$EDITOR deploy.env"
  exit 1
fi

: "${WEB_ROOT:?WEB_ROOT must be set in deploy.env}"
: "${APP_HOME:?APP_HOME must be set in deploy.env}"
: "${SERVICE_NAME:?SERVICE_NAME must be set in deploy.env}"

JAR_NAME="server-0.0.1-SNAPSHOT.jar"
BUILT_JAR="$REPO_ROOT/server/target/$JAR_NAME"
BUILD=1
DRY=0
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    --dry-run)  DRY=1 ;;
    *) echo "Unknown option: $arg"; exit 2 ;;
  esac
done

run() {
  if [ "$DRY" = "1" ]; then echo "  [dry-run] $*"; else "$@"; fi
}

echo "=== webpost.ing deploy: $(date) ==="
echo "    web root : $WEB_ROOT"
echo "    app home : $APP_HOME"
echo "    service  : $SERVICE_NAME"
[ "$DRY" = "1" ] && echo "    MODE     : dry run, nothing will change"

# ── 1. Build ──────────────────────────────────────────────────────────────────
if [ "$BUILD" = "1" ]; then
  echo "[1/4] Building frontend..."
  run bash -c "cd '$REPO_ROOT/client' && npm ci --prefer-offline --silent && npm run build"

  echo "[2/4] Building backend..."
  run bash -c "cd '$REPO_ROOT/server' && ./mvnw package -DskipTests -q"
else
  echo "[1-2/4] Skipping build (--no-build)"
fi

if [ "$DRY" = "0" ] && [ ! -f "$BUILT_JAR" ]; then
  echo "ERROR: $BUILT_JAR not found — build first, or drop --no-build."
  exit 1
fi

# ── 2. Publish ────────────────────────────────────────────────────────────────
# Building does not deploy: the build tree and the runtime tree are different
# directories, and forgetting this step is the classic "my fix isn't live".
echo "[3/4] Publishing artifacts..."
run sudo mkdir -p "$WEB_ROOT" "$APP_HOME/server/target"
run sudo cp -r "$REPO_ROOT/client/dist/." "$WEB_ROOT/"
run sudo cp "$BUILT_JAR" "$APP_HOME/server/target/$JAR_NAME"

# ── 3. Restart ────────────────────────────────────────────────────────────────
# systemd owns the JVM. Killing the process by port instead just makes systemd
# restart it underneath you, and `lsof` run as a normal user cannot even see the
# root-owned listener — which reads as "port free" right before "port in use".
echo "[4/4] Restarting $SERVICE_NAME..."
run sudo systemctl restart "$SERVICE_NAME"

if [ "$DRY" = "1" ]; then
  echo "=== Dry run complete. ==="
  exit 0
fi

# ── 4. Verify ─────────────────────────────────────────────────────────────────
echo "Waiting for the service to come up..."
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:8080/api/posts" 2>/dev/null \
  || [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/posts)" = "204" ]; then
    echo ""
    echo "=== Deploy complete. API responding after ${i}s. ==="
    echo "    Published bundle: $(grep -o 'index-[^.]*\.js' "$WEB_ROOT/index.html" | head -1)"
    exit 0
  fi
  sleep 1
done

echo ""
echo "=== ERROR: API did not respond within 30s. ==="
sudo systemctl status "$SERVICE_NAME" --no-pager | head -20
exit 1
