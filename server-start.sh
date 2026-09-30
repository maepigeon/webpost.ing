#!/usr/bin/env bash
# server-start.sh — start the Spring Boot JAR. Invoked by the systemd unit.
#
# Reads every setting from deploy.env (see config/deploy.env.example). The JVM
# needs no -D flags: application.properties resolves ${VAR:default} straight
# from the environment, so APP_PROFILE alone selects dev or prod.

set -euo pipefail

APP_HOME_DEFAULT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${DEPLOY_ENV:-$APP_HOME_DEFAULT/deploy.env}"

if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
else
  echo "WARNING: $ENV_FILE not found — starting with built-in development defaults."
fi

APP_HOME="${APP_HOME:-$APP_HOME_DEFAULT}"
JAR="${JAR_PATH:-$APP_HOME/server/target/server-0.0.1-SNAPSHOT.jar}"

if [ ! -f "$JAR" ]; then
  echo "ERROR: JAR not found at $JAR"
  exit 1
fi

echo "Starting webpost.ing backend — profile=${APP_PROFILE:-dev}, jar=$JAR"
exec java -jar "$JAR"
