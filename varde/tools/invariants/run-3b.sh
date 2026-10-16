#!/usr/bin/env bash
# Seminar live poll (3b: 3.4 states and presenter key, 3.5 big screen and its stream, 3.6 phones,
# 3.7 load). Integration blocks need Postgres (DATABASE_URL, as the integration job). Browser checks
# (the admin opens a question → three phones answer → close → show → bars on the big screen; the
# phone at 360 and 1280 px, light and dark, nn and en; a lost acknowledgement) run in the e2e job:
# apps/admin/e2e/live.spec.ts, apps/runner/e2e/live.spec.ts.
#   --load  also the load test (builds the API): 60 phones behind one NAT within 30 s, p95 < 1 s,
#           no 429 (tools/invariants/load-3b.mjs; not in CI).
set -euo pipefail
cd "$(dirname "$0")/../.."
load=false
[[ "${1:-}" == "--load" ]] && load=true
total=7
$load && total=8
n=0
block() { local name="$1"; shift; n=$((n+1)); echo "== [$n/$total] $name"; "$@"; echo "[$n/$total] $name: ok"; }
integration() { pnpm -s --filter @varde/api exec vitest run --config vitest.integration.config.mts "$@"; }
block 'live poll: migration forward and back (down → up keeps the technical client, a new poll can be made); one RoundClient on the technical seminar client, which no choice of a client accepts; live rounds 404 in survey views; steps led by the server (waiting → open → closed → released, reopen only before shown), one open question, refused by the database too; answers only to the open question («Spørsmålet er stengt.»); AuditLog on every step' integration test/migrations.test.ts test/live/migration-rollback.test.ts test/live/live-poll.test.ts
block 'seminar day without Entra: open → three phones → close → show; k = 3 for the count («Færre enn tre har svart») and the result («too few», no numbers); multi counts; the presenter key: sha256 only, shown once, day before to day after (Oslo), revoked → 403, issue and revoke in AuditLog, never in any output' integration test/live/presenter.test.ts
block 'presenter stream (SSE): snapshot first and after a reconnect, a push on every change, the count and shown results only through privacy (k = 3), no answers or free text, a revoked key ends it, no key in any output' integration test/live/stream.test.ts
block 'phones: only the open question, waiting / between / done, limits per question and per IP of their own, sixty phones behind one NAT without a 429' integration test/live/runner-live.test.ts
block 'every route with the presenter key: only the presenter routes of its own poll answer, the key changes nothing elsewhere (401/403); registered routes release no answers or identifiers' integration test/invariants/3b-presenter-routes.test.ts test/invariants/1c-no-leak-routes.test.ts
block 'without a database: steps, presenter window (Oslo, summer time), live versions, key format, nynorsk; /p headers; big screen, phone and the «Live» tab' bash -c 'pnpm -s --filter @varde/api exec vitest run test/live/rules.test.ts test/runner/static.test.ts && pnpm -s --filter @varde/runner exec vitest run test/presenter.test.tsx test/live.test.tsx && pnpm -s --filter @varde/admin exec vitest run test/seminar-live.test.tsx test/seminar.test.tsx'
block 'privacy lint: responses and seminar participants outside modules/privacy are rejected' pnpm -s lint:privacy:selfcheck
if $load; then
  block 'load: 60 phones behind one NAT answer the open question within 30 s; p95 < 1 s, no 429, the shown result counts every answer' bash -c 'pnpm -s --filter "@varde/api..." build && node tools/invariants/load-3b.mjs --phones 60 --seconds 30'
fi
echo "invariants 3b: $n/$total ok"
