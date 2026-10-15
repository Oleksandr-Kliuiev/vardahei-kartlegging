#!/usr/bin/env bash
# Vardestien (1e): design tokens, motion helpers, runner geometry and bundle, preview framing.
# Browser invariants (frame-by-frame motion, reduced motion, double tap, hold-to-confirm, phone preview)
# run in the e2e job: apps/runner/e2e/{motion,landscape,screens}.spec.ts, apps/admin/e2e/{rounds,sletting,management}.spec.ts.
set -euo pipefail
cd "$(dirname "$0")/../.."
total=3
n=0
block() { local name="$1"; shift; n=$((n+1)); echo "== [$n/$total] $name"; "$@"; echo "[$n/$total] $name: ok"; }
block 'design tokens (brand colours, dark theme parity, zones, linear() fallback) and motion helpers' pnpm -s --filter @varde/ui test
block 'runner geometry, trail state, preview message origin and bundle budget' pnpm -s --filter @varde/runner exec vitest run test/landscape.test.ts test/preview.test.tsx test/bundle-size.test.ts
block "only /r?preview= may be framed, and only by Varde ('self'); other runner paths 'none'" pnpm -s --filter @varde/api exec vitest run test/runner/static.test.ts
echo "invariants 1e: $n/$total ok"
