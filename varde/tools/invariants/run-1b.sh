#!/usr/bin/env bash
# Server-side checkpoint 1b invariants. Chromium specs run separately in the e2e job.
set -euo pipefail
cd "$(dirname "$0")/../.."
total=7
n=0
block() {
  local name="$1"
  shift
  n=$((n + 1))
  echo "== [$n/$total] $name"
  "$@"
  echo "[$n/$total] $name: ok"
}
integration() { pnpm -s --filter @varde/api exec vitest run --config vitest.integration.config.mts "$@"; }
block 'replay, tombstone, lost acknowledgement, pruning and identifier' integration test/responses/submission.test.ts
block 'insertion-only quotas, NAT and concurrent limit' integration test/responses/quotas.test.ts
block 'runner 2xx silent; 4xx and DB errors never disclose codes or identifiers' integration test/responses/submission-logs.test.ts
block 'progress aggregates only, k suppression and TTL' integration test/responses/progress.test.ts
block 'codes and RoundClient lifecycle' integration test/rounds/codes.test.ts test/rounds/lifecycle.test.ts
block 'invitations, languages and A4 QR matrix' integration test/rounds/invitation.test.ts
block 'runner draft, independent retries, advice, profile and bundle budget' pnpm -s --filter @varde/runner test
echo "invariants 1b: $n/$total ok"
