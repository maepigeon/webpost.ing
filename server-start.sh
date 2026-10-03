#!/usr/bin/env bash
# server-start.sh — start the Spring Boot JAR. Invoked by the systemd unit.
#
# Reads every setting from deploy.env (see config/deploy.env.example). The JVM
# needs no -D flags: application.properties resolves ${VAR:default} straight
# from the environment, so APP_PROFILE alone selects dev or prod. Memory flags
# come from JAVA_OPTS (below).

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

# Memory limits for the 2 GB server: a capped heap, one small collector, and
# exit on out-of-memory so systemd restarts the app instead of it hanging.
# Override with JAVA_OPTS in deploy.env; an empty JAVA_OPTS= means no flags.
DEFAULT_JAVA_OPTS="-Xmx640m -Xms256m -XX:+UseSerialGC -XX:+ExitOnOutOfMemoryError -XX:MaxMetaspaceSize=192m"
JAVA_OPTS="${JAVA_OPTS-$DEFAULT_JAVA_OPTS}"

echo "Starting webpost.ing backend — profile=${APP_PROFILE:-dev}, jar=$JAR, java opts=${JAVA_OPTS:-none}"
# shellcheck disable=SC2086  # JAVA_OPTS is meant to split into words
exec java $JAVA_OPTS -jar "$JAR"
