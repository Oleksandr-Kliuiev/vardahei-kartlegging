#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
state="${VARDE_STAGING_DIR:-${TMPDIR:-/tmp}/varde-staging}"
if [[ -f "$state/control-url" ]]; then
 url="$(cat "$state/control-url")"
 curl --fail --silent --max-time 3 -X POST "$url" >/dev/null || true
 for ((i=0;i<40;i++)); do
  curl --silent --max-time 1 "$url" >/dev/null || break
  sleep 0.25
 done
fi
if [[ -f "$state/parent-url" ]]; then
 export DATABASE_URL="$(cat "$state/parent-url")"
 node tools/staging/database.mjs drop varde_staging
fi
rm -f "$state/pid" "$state/parent-url" "$state/old-url" "$state/old-login.json" "$state/control-url" "$state/server.log"
rmdir "$state" 2>/dev/null || true
# Shared dev Postgres remains running; never restart or remove another user's Docker data.
