#!/usr/bin/env bash
# Seminars (3a: 3.1 entities and retention, 3.2 registration and ICS, 3.3 material, 3.10
# invitation). Integration blocks need Postgres (DATABASE_URL, as the integration job). Browser
# checks (admin flow create → link → registration → list → invitation, ICS and poster →
# deletion by e-mail; the public page at 360 and 1280 px, light and dark, nn and en) run in the
# e2e job: apps/admin/e2e/seminar.spec.ts, apps/runner/e2e/seminar.spec.ts.
set -euo pipefail
cd "$(dirname "$0")/../.."
total=7
n=0
block() { local name="$1"; shift; n=$((n+1)); echo "== [$n/$total] $name"; "$@"; echo "[$n/$total] $name: ok"; }
integration() { pnpm -s --filter @varde/api exec vitest run --config vitest.integration.config.mts "$@"; }
block 'entities: migrations forward and back; Response never refers to Contact or Registration; finding status on attach; actions by rule key' integration test/migrations.test.ts test/seminars/seminars.test.ts test/response-constraints.test.ts
block 'participants: two consents (registration; invitations on the contact, the form only adds it); list, yearly check and contacts of one client under AuditLog; registrations 90 days after the seminar and a contact without registrations and consent to invitations in the same run (dry-run, idempotent, journal, lock per e-mail); deletion by e-mail with ledger, AuditLog and reapply after restore' integration test/seminars/participants.test.ts test/seminars/client-page.test.ts test/retention/jobs.test.ts
block 'registration: same answer for a repeat and the honeypot, quotas per seminar, IP and in total, no names or e-mail in logs or errors, page headers, calendar file' integration test/seminars/registration.test.ts
block 'material after the seminar only; invitation package by hand (letter, link, ICS, poster with a local QR code), AuditLog without the code' integration test/seminars/materials.test.ts test/seminars/invitation.test.ts
block 'every route: participant data only in the three audited channels; registered routes release no answers or identifiers' integration test/invariants/3a-participants.test.ts test/invariants/1c-no-leak-routes.test.ts
block 'without a database: ICS (RFC 5545, parsed by ical.js), both consent versions pinned, Oslo times, invitation texts; the seminar page and the admin section' bash -c 'pnpm -s --filter @varde/api exec vitest run test/seminars/ics.test.ts test/seminars/texts.test.ts test/seminars/invitation-texts.test.ts test/runner/static.test.ts && pnpm -s --filter @varde/runner exec vitest run test/seminar.test.tsx && pnpm -s --filter @varde/admin exec vitest run test/seminar.test.tsx test/shell.test.tsx'
block 'privacy lint: responses and seminar participants outside modules/privacy are rejected' pnpm -s lint:privacy:selfcheck
echo "invariants 3a: $n/$total ok"
