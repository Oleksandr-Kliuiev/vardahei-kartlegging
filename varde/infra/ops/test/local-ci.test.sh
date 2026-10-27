#!/usr/bin/env bash
# local-ci.sh must run what .github/workflows/varde.yml runs (IMPROVEMENT-PLAN 0.3): every command of a
# `- run:` line of the workflow, and the key commands of its multi-line steps, appear in local-ci.sh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
WF="$ROOT/.github/workflows/varde.yml"
CI="$HERE/../local-ci.sh"
fail=0
bash -n "$CI"
# one-line commands; install of browsers/system packages and the pnpm setup differ on purpose
while IFS= read -r cmd; do
  case "$cmd" in
    "pnpm install --frozen-lockfile" | "pnpm --filter @varde/admin exec playwright install --with-deps chromium") continue ;;
  esac
  case "$cmd" in
    "pnpm invariants:"*) # run in `for inv in …` loops
      grep -E "^for inv in" "$CI" | tr ' ;' '\n\n' | grep -qxF -- "${cmd#pnpm invariants:}" || { echo "FAIL local-ci.sh misses: $cmd"; fail=1; }
      continue ;;
  esac
  grep -qF -- "$cmd" "$CI" || { echo "FAIL local-ci.sh misses: $cmd"; fail=1; }
done < <(sed -n 's/^ *- run: \([^>|].*\)$/\1/p' "$WF" | grep -vE "^(PGPASSWORD|DATABASE_URL)=")
# multi-line steps
for key in "migrate deploy" "break-glass-env.test.sh" "compose-config.test.sh" "caddy-log.test.sh" "caddy-edge.test.sh" \
  "vps-sample.test.sh" "db-budget.json" "static/runner/index.html" "@varde/schema/metrics/populations" \
  "parity:golden --check" "test:golden" "playwright test" "varde_e2e_runner" "VARDE_RESTORE_DOCKER" \
  "backup.test.sh" "pnpm secrets" "secrets:selfcheck" '"status\":\"ok\",\"version\":\"ci\"'; do
  grep -qF -- "$key" "$CI" || { echo "FAIL local-ci.sh misses: $key"; fail=1; }
  case "$key" in
    backup.test.sh | caddy-edge.test.sh | VARDE_RESTORE_DOCKER) ;; # not all of them are in the workflow under this spelling
    *) grep -qF -- "${key//\\/}" "$WF" || { echo "FAIL varde.yml no longer has: $key (update local-ci.sh)"; fail=1; } ;;
  esac
done
[ "$fail" = 0 ] && echo "ok   local-ci.sh covers the steps of varde.yml"
exit "$fail"
