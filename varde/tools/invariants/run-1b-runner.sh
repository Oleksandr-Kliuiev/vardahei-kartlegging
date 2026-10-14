#!/usr/bin/env bash
# The first 1b batch only; Submission API/progress invariants belong to the next batch (1.22).
set -euo pipefail
cd "$(dirname "$0")/../.."
pnpm --filter @varde/api exec vitest run --config vitest.integration.config.mts test/rounds/codes.test.ts test/rounds/lifecycle.test.ts
pnpm --filter @varde/api exec vitest run test/log-no-query.test.ts test/runner/static.test.ts test/runner/content.test.ts
pnpm --filter @varde/runner exec vitest run test/paths.test.ts test/renderers.test.tsx test/draft.test.ts test/submission.test.ts test/survey.test.tsx test/bundle-size.test.ts
printf 'invariants 1b runner: 3/3 ok\n'
