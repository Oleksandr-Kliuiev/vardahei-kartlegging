#!/usr/bin/env bash
# `pnpm invariants:0c` (task 0.19b): invariants of checkpoint 0c in one run (job integration).
# Needs DATABASE_URL of a migrated Postgres (rows: AuditLog in one transaction with the read).
# Block 6 (Atlas observation schema, 0.17) is moved to stage 4 by the decision of 13.10; it is
# reported as deferred, not as ok.
set -uo pipefail
cd "$(dirname "$0")/../.."

total=9
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

block "privacy aggregate (k, complementary, small clients, part x population) and HTTP 401/404" \
  bash -c "$(declare -f unit); unit test/privacy/aggregate.test.ts test/privacy/privacy-http.test.ts"
block "privacy rows: admin session, AuditLog in one transaction, respondent_key by mode" \
  bash -c "$(declare -f integration); integration test/privacy/rows.test.ts"
block "privacy.release(): history of releases" bash -c "$(declare -f unit); unit test/privacy/release.test.ts"
block "no leak keys in privacy outputs (both modes)" \
  bash -c "$(declare -f unit); unit test/invariants/0c-no-leak-keys.test.ts"
block "schemas 0.16: MetricDefinition, AggregateSnapshot" pnpm -s --filter @varde/schema exec vitest run \
  test/metric-definition.test.ts test/aggregate-snapshot.test.ts
deferred_block "schema 0.17: Atlas observation" "stage 4"
block "retention config and RETENTION.md" bash -c \
  "$(declare -f unit); unit test/retention.config.test.ts && pnpm -s --filter @varde/tools-docs exec vitest run test/retention-doc.test.ts"
block "respondent notice v2 texts" pnpm -s --filter @varde/runner exec vitest run test/notice-v2.test.ts
block "privacy lint: selfcheck (dashboard bypass), rule tests, lint" bash -c \
  "pnpm -s lint:privacy:selfcheck && pnpm -s --filter @varde/tools-eslint-rules exec vitest run test/privacy-only-release.test.ts && pnpm -s lint"
echo "invariants 0c: $((total - deferred))/$total ok, $deferred deferred 13.10 (0.17 → stage 4)"
