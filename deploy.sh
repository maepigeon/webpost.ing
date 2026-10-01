#!/usr/bin/env bash
# deploy.sh — retired.
#
# This used to build and deploy on the production server itself. Building
# there (Maven, npm, tests) is what ran the 2 GB server out of memory and
# crashed it on 2026-09-30, so releases are now built on your own computer:
#
#     ./tools/release.sh
#
# It tests, builds, uploads and installs, with a backup and an automatic
# rollback. See guide/DEPLOYMENT.md.
echo "deploy.sh is retired: run ./tools/release.sh on your own computer instead."
echo "See guide/DEPLOYMENT.md."
exit 1
