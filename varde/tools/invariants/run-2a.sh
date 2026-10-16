#!/usr/bin/env bash
# FindingRule editor (2a, 2.5): a change is a new version; saved findings of a release never change;
# the preview reads only through privacy (k = 3, audited leader reads). Browser checks (edit → preview
# → «Lagre som versjon N+1», 360/1280 px light and dark) run in the e2e job: apps/admin/e2e/funn.spec.ts.
set -euo pipefail
cd "$(dirname "$0")/../.."
total=5
n=0
block() { local name="$1"; shift; n=$((n+1)); echo "== [$n/$total] $name"; "$@"; echo "[$n/$total] $name: ok"; }
integration() { pnpm -s --filter @varde/api exec vitest run --config vitest.integration.config.mts "$@"; }
block 'rule schema: thresholds, texts, placeholders, fixed identity and options; preview outcomes under k' pnpm -s --filter @varde/api exec vitest run test/findings/rule-draft.test.ts
block 'versions with AuditLog, parallel saves, closed rounds keep saved findings, new release, preview, seed, triggers; report and archive keep them' integration test/findings/rule-editor.test.ts test/findings/backfill.test.ts test/findings/funn.test.ts test/reports/client-report-versions.test.ts test/exports/round-archive.test.ts
block 'migration forward and back (finding_set, immutability triggers)' integration test/migrations.test.ts
block 'registered routes, including the rule editor, release no answers or identifiers' integration test/invariants/1c-no-leak-routes.test.ts
block 'Funn page: debounced preview of outcome fields, save as next version, navigation, dashboard hint' pnpm -s --filter @varde/admin exec vitest run test/funn.test.tsx test/shell.test.tsx test/dashboard.test.tsx
echo "invariants 2a: $n/$total ok"
