#!/usr/bin/env bash
# Stage 5: client report (5.1) and round archive (5.2). Integration blocks need Postgres
# (DATABASE_URL, as the integration job). Browser invariants (print media without buttons,
# page.pdf(), archive download) run in the e2e job: apps/admin/e2e/{report,archive}.spec.ts.
set -euo pipefail
cd "$(dirname "$0")/../.."
total=5
n=0
block() { local name="$1"; shift; n=$((n+1)); echo "== [$n/$total] $name"; "$@"; echo "[$n/$total] $name: ok"; }
integration() { pnpm -s --filter @varde/api exec vitest run --config vitest.integration.config.mts "$@"; }
block 'client report: released aggregates only; no initials, keys, rows or leader parts; hidden cells without numbers; rule version at release' integration test/reports/client-report.test.ts
block 'round archive: round trip into an empty database, same dashboard, idempotent; refused archives write nothing; no rows or identifiers' integration test/exports/round-archive.test.ts
block 'registered routes, report and archive included, release no identifiers or answers' integration test/invariants/1c-no-leak-routes.test.ts
block 'report and archive parts without a database; sheet shows «–» for hidden cells, PDF only after the check, nynorsk without bokmål forms' bash -c 'pnpm -s --filter @varde/api exec vitest run test/reports/report-parts.test.ts test/exports/round-archive-format.test.ts && pnpm -s --filter @varde/admin exec vitest run test/report.test.tsx'
block 'privacy lint bypass rejection' pnpm -s lint:privacy:selfcheck
echo "invariants 5: $n/$total ok"
