#!/usr/bin/env bash
# Roundtrip test of the backup (IMPROVEMENT-PLAN 0.1): builds the varde-backup image and runs test/roundtrip.sh
# in it — real varde-roles.sql and varde-db.sql, pg_dump, age, rclone (local remote), restore-check.sh and
# restore.sh; no VPS and no SharePoint.
set -euo pipefail
kit="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
docker build -q -t varde-backup:test "$kit" > /dev/null
docker run --rm -v "$kit:/kit:ro" -v "$kit/../sql:/sql:ro" varde-backup:test bash /kit/test/roundtrip.sh
