#!/usr/bin/env bash
# ci-scope.sh on a scratch repository: documents only, code, golden-relevant paths, no base.
# shellcheck disable=SC2015 # `test && ok || fail` where ok is an echo

set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCOPE="$HERE/../ci-scope.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
cd "$T"
git init -q -b main . && git config user.email t@example.test && git config user.name t
mkdir -p docs/varde varde/apps/api varde/apps/runner varde/tools/parity
echo 1 > docs/varde/a.md; echo 1 > varde/apps/api/a.ts; git add -A; git commit -qm base
BASE="$(git rev-parse HEAD)"
fail=0
expect() { # name base-commit-message expected
  local got; got="$("$SCOPE" "$BASE" HEAD | tr '\n' ' ')"
  [ "$got" = "$2 " ] && echo "ok   $1" || { echo "FAIL $1: got '$got', want '$2'"; fail=1; }
  git reset -q --hard "$BASE"
}
echo 2 > docs/varde/a.md; git commit -qam d
expect "documents only" "code=false golden=false"
echo 2 > varde/apps/api/a.ts; git commit -qam c
expect "api code" "code=true golden=false"
echo 2 > varde/apps/runner/b.ts; git add -A; git commit -qm r
expect "runner" "code=true golden=true"
echo 2 > varde/tools/parity/g.mjs; git add -A; git commit -qm p
expect "parity" "code=true golden=true"
mkdir -p .github/workflows; echo 2 > .github/workflows/varde.yml; git add -A; git commit -qm w
expect "workflow" "code=true golden=true"
[ "$("$SCOPE" "" HEAD | tr '\n' ' ')" = "code=true golden=true " ] && echo "ok   no base" || { echo "FAIL no base"; fail=1; }
[ "$("$SCOPE" 0000000000000000000000000000000000000000 HEAD | tr '\n' ' ')" = "code=true golden=true " ] && echo "ok   new branch" || { echo "FAIL new branch"; fail=1; }
[ "$("$SCOPE" deadbeefdeadbeefdeadbeefdeadbeefdeadbeef HEAD | tr '\n' ' ')" = "code=true golden=true " ] && echo "ok   unknown base" || { echo "FAIL unknown base"; fail=1; }
exit "$fail"
