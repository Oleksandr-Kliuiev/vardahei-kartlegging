#!/usr/bin/env bash
# Complete synthetic rehearsal in its own database; parent DB is never changed.
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ "${1:-}" == '--ci' && "$#" == 1 ]] || { echo 'usage: rehearsal.sh --ci' >&2; exit 2; }
: "${DATABASE_URL:?parent localhost DATABASE_URL is required}"
export VARDE_REHEARSAL_DATABASE="varde_rehearsal_$(date +%s)_$RANDOM"
VARDE_REHEARSAL_DATABASE="${VARDE_REHEARSAL_DATABASE//_/}"
export VARDE_REHEARSAL_DATABASE="varde_rehearsal_${VARDE_REHEARSAL_DATABASE#varderehearsal}"
parent_url="$DATABASE_URL"
cleanup() { DATABASE_URL="$parent_url" node tools/staging/database.mjs drop "$VARDE_REHEARSAL_DATABASE"; }
node tools/staging/database.mjs create "$VARDE_REHEARSAL_DATABASE"
trap cleanup EXIT
export DATABASE_URL="${DATABASE_URL%/*}/$VARDE_REHEARSAL_DATABASE"
pnpm --filter @varde/api db:migrate
pnpm --filter @varde/api... build
pnpm --filter @varde/runner build
pnpm --filter @varde/admin build
pnpm --filter @varde/api exec vitest run --config vitest.integration.config.mts --reporter verbose test/cutover/rehearsal.test.ts
printf 'rehearsal ok (8 steps, rollback 1)\n'
