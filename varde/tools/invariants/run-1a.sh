#!/usr/bin/env bash
# `pnpm invariants:1a` (task 1.11): invariants of checkpoint 1a in one run (job integration).
# Needs DATABASE_URL of a migrated Postgres whose user may CREATE DATABASE (migrations test).
set -uo pipefail
cd "$(dirname "$0")/../.."

total=8
n=0
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

block "migrations of stage 1 forward and back" bash -c "$(declare -f integration); integration test/migrations.test.ts"
block "published template version and released snapshot are immutable (triggers)" bash -c \
  "$(declare -f integration); integration test/surveys/template-version.test.ts test/privacy/prisma-snapshot-store.test.ts"
block "repeated import of svar and runde1 adds 0 rows; tombstones suppress" bash -c \
  "$(declare -f integration); integration test/imports/svar-import.test.ts test/imports/runde1-import.test.ts"
block "respondent_key only in identified rounds (trigger, import); identifier not in answers" bash -c \
  "$(declare -f integration); integration test/response-constraints.test.ts && pnpm -s --filter @varde/rules exec vitest run test/runner-normalize.test.ts"
block "stub removed (1.0)" bash -c "$(declare -f integration); integration test/stub-removed.test.ts"
block "privacy tightening 1.10b (cell shape, exact counter, key cut, break-glass who, brand, first_version)" bash -c \
  "$(declare -f integration unit); unit test/privacy/release.test.ts && integration test/privacy/rows.test.ts && pnpm -s --filter @varde/schema exec vitest run test/metric-definition.test.ts && pnpm -s lint:privacy:selfcheck"
block "released snapshots equal the golden of the old dashboard (parity 1.10)" bash -c \
  "$(declare -f integration); integration test/metrics/parity.test.ts"
block "completeness: snapshots = raw; after TRUNCATE response unchanged, rows empty" bash -c \
  "$(declare -f integration); integration test/invariants/1a-completeness.test.ts"
echo "invariants 1a: $n/$total ok"
