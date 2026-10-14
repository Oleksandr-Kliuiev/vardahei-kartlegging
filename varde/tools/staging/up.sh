#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
state="${VARDE_STAGING_DIR:-${TMPDIR:-/tmp}/varde-staging}"
if [[ -e "$state/pid" ]]; then echo 'staging already exists; run down.sh first' >&2; exit 1; fi
mkdir -m 700 -p "$state"
if [[ -z "${DATABASE_URL:-}" ]]; then
 docker compose -f infra/compose.dev.yml up -d --wait
 export DATABASE_URL="postgresql://varde:varde-dev@127.0.0.1:${VARDE_DEV_PG_PORT:-5433}/varde_dev"
fi
node tools/staging/database.mjs create varde_staging
printf '%s' "$DATABASE_URL" > "$state/parent-url"
chmod 600 "$state/parent-url"
export DATABASE_URL="${DATABASE_URL%/*}/varde_staging"
export VARDE_STAGING_DIR="$state"
trap 'bash tools/staging/down.sh' ERR
pnpm --filter @varde/api db:migrate
pnpm --filter @varde/api... build
pnpm --filter @varde/admin build
pnpm --filter @varde/runner build
node apps/api/dist/cli.js seed --clients config/seed/clients.json --kundar tools/parity/fixtures/kundar.json --tilgang tools/parity/fixtures/tilgang.json
node apps/api/dist/cli.js import runde1 --file tools/parity/fixtures/runde1.synthetic.js
node apps/api/dist/cli.js import svar --file tools/parity/fixtures/svar.synthetic.jsonl
node apps/api/dist/cli.js rounds close --imported
apps/api/node_modules/.bin/tsx tools/staging/mock.mts > "$state/server.log" 2>&1 &
printf '%s' "$!" > "$state/pid"
for ((i=0;i<60;i++)); do
 if curl --fail --silent http://localhost:3000/health >/dev/null; then echo 'staging ready: http://localhost:3000/auth/login'; exit 0; fi
 sleep 0.5
done
echo 'staging did not become healthy' >&2
exit 1
