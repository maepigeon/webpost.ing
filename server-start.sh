#!/bin/bash
# server-start.sh — Start the Spring Boot JAR in production mode.
#
# -Dspring.profiles.active=prod activates HTTPS cookies and the absolute
# upload path from application-prod.properties.  application.properties
# can stay on 'dev' for local development — never edit it before deploying.
#
# Run from the repo root or any directory; adjust the path to the JAR if
# you've moved it outside the default target/ location.

echo "Starting up webpost.ing backend server!"

JAR="/home/webpost.ing/server/target/server-0.0.1-SNAPSHOT.jar"

java -Dspring.profiles.active=prod -jar "$JAR" &

wait
