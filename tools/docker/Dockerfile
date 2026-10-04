# Toolchain for developing webpost.ing in a container: Node 22, JDK 21 and the
# PostgreSQL 15 client. The repository is mounted at /workspace; nothing here
# is installed on the computer itself.
FROM node:22-bookworm

COPY --from=eclipse-temurin:21-jdk /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="${JAVA_HOME}/bin:${PATH}"

# lsof: tools/run-local.sh uses it to see which ports are taken.
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client lsof less \
 && rm -rf /var/lib/apt/lists/*

# The repository belongs to the computer's user, not the container's; without
# this git refuses to read it ("dubious ownership"), and vite.config.js asks
# git for the build commit.
RUN git config --system --add safe.directory '*'

WORKDIR /workspace
