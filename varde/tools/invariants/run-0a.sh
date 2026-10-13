#!/usr/bin/env bash
# `pnpm invariants:0a` (task 0.4b): invariants of checkpoint 0a in one run.
# Needs Docker (gitleaks) and DATABASE_URL (migrations); runs in the CI job `integration`.
set -uo pipefail
cd "$(dirname "$0")/../.."

total=6
n=0
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

block "context-budget" bash -c 'pnpm -s budget && pnpm -s budget:selfcheck'
block "privacy bypass (stub rule)" pnpm -s lint:privacy:selfcheck
block "import boundaries" pnpm -s --filter @varde/tools-eslint-rules exec vitest run test/boundaries.test.ts
block "migrations forward/back" pnpm -s --filter @varde/api exec vitest run \
  --config vitest.integration.config.mts test/migrations.test.ts
block "secrets" bash -c 'pnpm -s secrets && pnpm -s secrets:selfcheck'
block "no secrets in .env examples" pnpm -s --filter @varde/tools-invariants exec vitest run \
  test/no-secrets-in-examples.test.ts
echo "invariants 0a: $total/$total ok"
