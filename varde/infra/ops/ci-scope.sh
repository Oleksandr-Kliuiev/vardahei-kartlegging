#!/usr/bin/env bash
# What a push or pull request changed, for the `changes` job of .github/workflows/varde.yml (IMPROVEMENT-PLAN 0.7).
# Usage: ci-scope.sh <base sha> <head sha>   — prints `code=true|false` and `golden=true|false`.
#   code   — something outside docs/varde/ changed: integration, image and e2e run. A change of documents
#            only still runs `check` (its tests read the documents) and `secrets`, about 3 min instead of 65.
#   golden — the old dashboard, parity, rules, schema, runner or the template seeds changed: the golden
#            check and the runner's paths.spec (75 % of the e2e time) run.
# No usable base (a new branch, a force push, a manual run) means everything runs.
set -euo pipefail
BASE="${1:-}"; HEAD="${2:-HEAD}"
all() { echo "code=true"; echo "golden=true"; }
if [ -z "$BASE" ] || [ "$BASE" = 0000000000000000000000000000000000000000 ] || ! git cat-file -e "$BASE^{commit}" 2> /dev/null; then
  all; exit 0
fi
files="$(git diff --name-only "$BASE" "$HEAD")" || { all; exit 0; }
code=false; golden=false
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    docs/varde/*) ;;
    *) code=true ;;
  esac
  case "$f" in
    kartlegging/* | varde/tools/parity/* | varde/packages/rules/* | varde/packages/schema/* | varde/apps/runner/* | varde/config/seed/* | .github/workflows/varde.yml) golden=true ;;
  esac
done <<< "$files"
echo "code=$code"; echo "golden=$golden"
