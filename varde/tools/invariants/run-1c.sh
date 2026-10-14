#!/usr/bin/env bash
# Export, deletion and cross-population history gates; rehearsal has its own empty DB.
set -euo pipefail
cd "$(dirname "$0")/../.."
total=9
n=0
block() { local name="$1"; shift; n=$((n+1)); echo "== [$n/$total] $name"; "$@"; echo "[$n/$total] $name: ok"; }
integration() { pnpm -s --filter @varde/api exec vitest run --config vitest.integration.config.mts "$@"; }
block 'registered routes and cross-population issue history' integration test/invariants/1c-no-leak-routes.test.ts test/invariants/1c-submission-boundaries.test.ts test/privacy/release-cross-population.test.ts test/privacy/release-http-history.test.ts
block 'aggregate and row channels, leaders, findings and comparison' integration test/dashboard/aggregate-view.test.ts test/dashboard/leader.test.ts test/dashboard/rows-view.test.ts test/dashboard/comparison.test.ts test/dashboard/privacy-filters.test.ts test/findings/funn.test.ts
block 'CSV, Master_Analyse and AES-256 handover' integration test/exports/csv.test.ts test/exports/master-analyse.test.ts test/retention/handover.test.ts
block 'retention, real forget replay, ledger and archive deadline' integration test/retention/jobs.test.ts test/retention/forget.test.ts test/cutover/archive.test.ts test/retention/forget-restore.test.ts
block 'privacy lint bypass rejection' pnpm -s lint:privacy:selfcheck
block 'read-only legacy server on synthetic data' node ../tools/test/lesemodus.test.js
block 'archive cleaning and isolated staging tooling' pnpm -s --filter @varde/tools-parity test
block 'cutover runbook and checklist' pnpm -s --filter @varde/tools-docs test
block 'eight-step cutover, rollback and recutover' bash tools/cutover/rehearsal.sh --ci
echo "invariants 1c: $n/$total ok"
