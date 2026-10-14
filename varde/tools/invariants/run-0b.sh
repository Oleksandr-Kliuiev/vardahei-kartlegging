#!/usr/bin/env bash
# `pnpm invariants:0b` (task 0.12b): invariants of checkpoint 0b in one run (job integration).
# Needs Docker and DATABASE_URL of a superuser (CI service Postgres or infra/compose.dev.yml).
# Block 5 (backup guard, rotation, ledger export) belongs to 0.10/0.10e, deferred by the decision
# of 13.10 (backup is not required); it is reported as deferred, not as ok. The eighth block,
# roundtrip.sh --ci in job image (0.10c), is deferred for the same reason.
set -uo pipefail
cd "$(dirname "$0")/../.."

total=7
n=0
deferred=0
integration() { pnpm -s --filter @varde/api exec vitest run --config vitest.integration.config.mts "$@"; }
unit() { pnpm -s --filter @varde/api exec vitest run "$@"; }
block() {
  local name="$1"
  shift
  n=$((n + 1))
  echo "== [$n/$total] $name"
  if "$@"; then
    echo "[$n/$total] $name: ok"
  else
    echo "[$n/$total] $name: FAILED" >&2
    exit 1
  fi
}
deferred_block() {
  n=$((n + 1))
  deferred=$((deferred + 1))
  echo "== [$n/$total] $1"
  echo "[$n/$total] $1: deferred 13.10 ($2)"
}

block "database isolation, read-only backup, audit journal" bash -c \
  "$(declare -f integration); integration test/db-roles.test.ts && bash infra/sql/test/bootstrap.test.sh"
block "no query in logs (api and Caddy error log)" bash -c \
  "$(declare -f unit); unit test/log-no-query.test.ts && bash infra/caddy/test/caddy-log.test.sh"
block "break-glass (socket only, window, AuditLog, hash through env_file)" bash -c \
  "$(declare -f unit); unit test/break-glass.test.ts && pnpm -s --filter "@varde/api..." build && bash infra/test/break-glass-env.test.sh"
block "pg-boss (payload ids only, limits, singleton, budget, pg_dump after pgboss)" bash -c \
  "$(declare -f integration unit); integration test/jobs.test.ts && unit test/db-budget.test.ts"
deferred_block "backup guard, rotation, ledger export" "0.10, 0.10e"
block "Entra login and cookie session" bash -c "$(declare -f unit); unit test/auth.test.ts"
block "stub removed (1.0); .env.example names only" bash -c \
  "$(declare -f integration); integration test/stub-removed.test.ts && pnpm -s --filter @varde/tools-invariants exec vitest run test/0b-env-example.test.ts"
echo "invariants 0b: $((total - deferred))/$total ok, $deferred deferred 13.10 (block 8 roundtrip in job image: deferred, 0.10c)"
