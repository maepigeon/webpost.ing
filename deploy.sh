#!/usr/bin/env bash
# deploy.sh — Build and restart webpost.ing on the production server.
#
# Run from the repo root on the production host:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Prerequisites:
#   - Java 21+, Maven wrapper (./mvnw) present in server/
#   - Node.js 18+, npm present
#   - nginx configured to serve client/dist/ and proxy /api/ -> :8080
#   - /var/www/webposting/uploads/ exists and is writable by this user
#
# Profile note: this script always passes -Dspring.profiles.active=prod to
# the JVM, so application.properties can stay set to 'dev' for local work —
# you never need to manually flip that file before deploying.
#
# The script stops any running JAR, rebuilds both artifacts, then starts
# the new JAR in the background.  Log output goes to /tmp/webposting.log.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
JAR="$REPO_ROOT/server/target/server-0.0.1-SNAPSHOT.jar"
LOG="/tmp/webposting.log"

echo "=== webpost.ing deploy: $(date) ==="

# ── 1. Stop the running server ────────────────────────────────────────────────
echo "[1/4] Stopping old server..."
OLD_PID=$(lsof -ti :8080 2>/dev/null | head -1 || true)
if [ -n "$OLD_PID" ]; then
  kill "$OLD_PID" 2>/dev/null || true
  sleep 2
  echo "      Stopped PID $OLD_PID"
else
  echo "      No server running on :8080"
fi

# ── 2. Build frontend ─────────────────────────────────────────────────────────
echo "[2/4] Building frontend..."
cd "$REPO_ROOT/client"
npm install --prefer-offline --silent
npm run build
echo "      Done → client/dist/"

# ── 3. Build backend ──────────────────────────────────────────────────────────
echo "[3/4] Building backend..."
cd "$REPO_ROOT/server"
./mvnw package -DskipTests -q
echo "      Done → server/target/server-0.0.1-SNAPSHOT.jar"

# ── 4. Start new server ───────────────────────────────────────────────────────
echo "[4/4] Starting new server..."
cd "$REPO_ROOT/server/target"
nohup java -Dspring.profiles.active=prod -jar server-0.0.1-SNAPSHOT.jar >> "$LOG" 2>&1 &
NEW_PID=$!
echo "      Started PID $NEW_PID — logs at $LOG"

# Give it a moment and verify it's up
sleep 5
if kill -0 "$NEW_PID" 2>/dev/null; then
  echo ""
  echo "=== Deploy complete. Server running (PID $NEW_PID). ==="
else
  echo ""
  echo "=== ERROR: Server failed to start. Check $LOG ==="
  tail -30 "$LOG"
  exit 1
fi
