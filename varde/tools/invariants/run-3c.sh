#!/usr/bin/env bash
# Rounds of a seminar and «Før og etter» (3c: 3.8 before, live and after; 3.9 the comparison with
# caveats). Integration blocks need Postgres (DATABASE_URL, as the integration job). Browser checks
# (the whole seminar: a seminar with clients → registration on /s → live with three phones, closed
# and shown → the survey after from the round wizard → «Før og etter» at 360 and 1280 px, light and
# dark) run in the e2e job: apps/admin/e2e/seminar-day.spec.ts.
set -euo pipefail
cd "$(dirname "$0")/../.."
total=6
n=0
block() { local name="$1"; shift; n=$((n+1)); echo "== [$n/$total] $name"; "$@"; echo "[$n/$total] $name: ok"; }
integration() { pnpm -s --filter @varde/api exec vitest run --config vitest.integration.config.mts "$@"; }
block 'migration forward and back: trigger seminar_round_before_after_type, one seminar per «Etter»' integration test/migrations.test.ts
block 'rounds of a seminar: «Før» an ordinary survey with a client of the seminar, «Etter» only post_seminar — from the round wizard (a code per client, linked in the same transaction) or linked; types refused by the API and the database, one seminar per «Etter», refusals change nothing; AuditLog of every change of a link; the live round and the technical client are never offered' integration test/seminars/seminar-rounds.test.ts
block '«Før og etter» only through privacy: a closed «Før» from released snapshots (raw deleted → the same), an open «Etter» live with k; the sum over the seminar’s clients keeps complementary suppression (a hidden client hides it); hidden groups without numbers; a changed question or a metric without declared comparability is marked without numbers, an approximate link shows numbers and its note; the caveats always; the live poll and the technical client stay out; the comparison with round 1 unchanged' integration test/seminars/before-after.test.ts test/dashboard/comparison.test.ts
block 'every registered route with the new seminar routes: no answers or identifiers, the presenter key opens nothing new, no participant anywhere' integration test/invariants/1c-no-leak-routes.test.ts test/invariants/3b-presenter-routes.test.ts test/invariants/3a-participants.test.ts
block 'without a database: the card «Rundar» and the wizard for «Etter», «Før og etter» (caveats, bars before and after, hidden sides, marks), the tabs of a seminar' pnpm -s --filter @varde/admin exec vitest run test/seminar-rounds.test.tsx test/seminar-before-after.test.tsx test/seminar.test.tsx
block 'privacy lint: responses and aggregate snapshots outside modules/privacy are rejected' pnpm -s lint:privacy:selfcheck
echo "invariants 3c: $n/$total ok"
