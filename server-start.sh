#!/bin/bash
echo "Starting up webpost.ing backend server!"

cd /home/webpost.ing/server/target
java -jar server-0.0.1-SNAPSHOT.jar &

wait

