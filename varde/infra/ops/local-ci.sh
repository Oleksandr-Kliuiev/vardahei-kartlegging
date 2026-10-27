#!/usr/bin/env bash
# Local run of the steps of .github/workflows/varde.yml, for deploys while Actions is unavailable
# (IMPROVEMENT-PLAN 0.3). Usage: local-ci.sh [-o REGEX] [-k]
#   -o REGEX  run only the steps whose name matches (rerun of one failure; steps are independent,
#             every one gets the database it needs)
#   -k        keep the throwaway worktree and PostgreSQL afterwards
# Builds HEAD of this repository in a clean worktree (so uncommitted or ignored files cannot make a run
# green), with Node 22 (the Mac default is newer), a throwaway postgres:17.6-bookworm and free ports.
# Logs: $VARDE_CI_LOGS (default: a new temp dir); the summary ends with the steps that failed.
# A step that times out under load (the Mac also runs a browser and Docker) should be rerun with -o before
# it is called a failure; the same step failing twice is a failure.
# shellcheck disable=SC2016,SC2155 # the step bodies are single-quoted on purpose (they run in bash -c)
set -uo pipefail
ONLY=""; KEEP=0
while getopts "o:k" opt; do case "$opt" in o) ONLY="$OPTARG" ;; k) KEEP=1 ;; *) exit 2 ;; esac; done
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(git -C "$HERE" rev-parse --show-toplevel)"
SHA="$(git -C "$SRC" rev-parse --short=12 HEAD)"
LOG="${VARDE_CI_LOGS:-$(mktemp -d "${TMPDIR:-/tmp}/varde-ci-XXXXXX")}"
mkdir -p "$LOG"
for n in /opt/homebrew/opt/node@22/bin /usr/local/opt/node@22/bin; do [ -d "$n" ] && PATH="$n:$PATH"; done
export PATH
command -v node > /dev/null || { echo "node 22 is missing"; exit 2; }
case "$(node -v)" in v22.*) ;; *) echo "Node 22 is required, found $(node -v)"; exit 2 ;; esac
free_port() { python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])'; }
PGP="$(free_port)"; APP_PORT="$(free_port)"
PG="varde-localci-pg-$$"
URL="postgresql://varde:varde-ci@127.0.0.1:$PGP"
WT="$(mktemp -d "${TMPDIR:-/tmp}/varde-ci-wt-XXXXXX")"
PASS=0; FAIL=0; FAILED=()
cleanup() {
  [ "$KEEP" = 1 ] && { echo "kept: worktree $WT, postgres $PG on $PGP, logs $LOG"; return; }
  docker rm -f "$PG" > /dev/null 2>&1
  git -C "$SRC" worktree remove --force "$WT" > /dev/null 2>&1
}
trap cleanup EXIT

# step NAME CMD… : runs in the worktree, log per step, skipped when -o does not match
step() {
  local name="$1"; shift
  if [ -n "$ONLY" ] && ! [[ "$name" =~ $ONLY ]]; then return 0; fi
  local t0=$SECONDS f="$LOG/$(echo "$name" | tr -c 'a-zA-Z0-9' _).log"
  if "$@" > "$f" 2>&1; then PASS=$((PASS + 1)); echo "ok   $name ($((SECONDS - t0)) s)"
  else FAIL=$((FAIL + 1)); FAILED+=("$name"); echo "FAIL $name ($((SECONDS - t0)) s) → $f"; fi
}
mkdb() { docker exec "$PG" psql -U varde -d postgres -qc "drop database if exists $1" -c "create database $1" > /dev/null; }

echo "HEAD $SHA, node $(node -v), docker $(docker version -f '{{.Server.Version}}' 2> /dev/null), ports pg $PGP app $APP_PORT, logs $LOG"
git -C "$SRC" worktree add -q --detach "$WT" HEAD || exit 2
cd "$WT/varde" || exit 2
docker run -d --name "$PG" -p "127.0.0.1:$PGP:5432" -e POSTGRES_USER=varde -e POSTGRES_PASSWORD=varde-ci \
  -e POSTGRES_DB=varde_ci postgres:17.6-bookworm > /dev/null || exit 2
for _ in $(seq 1 60); do docker exec "$PG" pg_isready -U varde -d varde_ci > /dev/null 2>&1 && break; sleep 1; done

# job check
step "install" pnpm install --frozen-lockfile
step "lint" pnpm -r lint
step "test" pnpm -r test
step "build" pnpm -r build
step "budget" pnpm budget
step "budget:selfcheck" pnpm budget:selfcheck
step "lint:privacy:selfcheck" pnpm lint:privacy:selfcheck
step "ops tests" bash -c 'bash infra/ops/test/ci-scope.test.sh && bash infra/ops/test/local-ci.test.sh'

# job integration (VARDE_RESTORE_DOCKER=1 or the forget-restore test is skipped)
mkdb varde_ci
export DATABASE_URL="$URL/varde_ci" VARDE_RESTORE_DOCKER=1
step "db:migrate" pnpm --filter @varde/api db:migrate
step "runner build" pnpm --filter @varde/runner build
step "admin build" pnpm --filter @varde/admin build
step "test:integration" pnpm --filter @varde/api test:integration
for inv in 0a 0b 0c 1a 1b:runner 1b; do step "invariants:$inv" pnpm "invariants:$inv"; done
step "lesemodus" node ../tools/test/lesemodus.test.js
step "caddy-legacy" bash infra/caddy/test/caddy-legacy.test.sh
step "deploy.test" bash infra/ops/test/deploy.test.sh
for inv in 1c 1e 5 2a 3a 3b 3c; do step "invariants:$inv" pnpm "invariants:$inv"; done
unset VARDE_RESTORE_DOCKER

# job image (amd64 like the runner; a fresh database)
mkdb varde_img
IMG_DB="$URL/varde_img"
DOCKER_HOST_NET=(--network host)
[ "$(uname)" = Darwin ] && DOCKER_HOST_NET=(-p "127.0.0.1:$APP_PORT:$APP_PORT") # --network host is the VM's, not the Mac's
IMG_DB_FROM_CONTAINER="$IMG_DB"
MIGRATE_NET=(--network host)
if [ "$(uname)" = Darwin ]; then
  IMG_DB_FROM_CONTAINER="${IMG_DB/127.0.0.1/host.docker.internal}"
  MIGRATE_NET=(--add-host host.docker.internal:host-gateway)
fi
step "image build" docker buildx build --platform linux/amd64 -f infra/Dockerfile . --build-arg VARDE_VERSION=ci -t varde-api:ci --load
step "image starts without db" bash -c 'cid=$(docker run --rm -d --network host -e DATABASE_URL=postgresql://x:x@127.0.0.1:1/x varde-api:ci); sleep 5; r=$(docker inspect -f "{{.State.Running}}" "$cid"); docker stop "$cid" >/dev/null; test "$r" = true'
step "image runner" docker run --rm varde-api:ci test -f /out/static/runner/index.html
step "image config" docker run --rm varde-api:ci test -f /out/config/db-budget.json
step "image schema dist" bash -c 'test "$(docker run --rm varde-api:ci node -e "import(\"@varde/schema/metrics/populations\").then(()=>console.log(\"schema ok\"))")" = "schema ok"'
step "image migrate" docker run --rm "${MIGRATE_NET[@]}" -e DATABASE_URL="$IMG_DB_FROM_CONTAINER" varde-api:ci node node_modules/prisma/build/index.js migrate deploy
step "image health" bash -c '
  cid=$(docker run --rm -d "${@:3}" -e PORT='"$APP_PORT"' -e DATABASE_URL="$1" --add-host host.docker.internal:host-gateway varde-api:ci)
  for i in $(seq 1 120); do curl -sf http://127.0.0.1:'"$APP_PORT"'/health >/dev/null && break; sleep 1; done
  body=$(curl -s http://127.0.0.1:'"$APP_PORT"'/health); docker logs "$cid" 2>&1 | tail -3; docker stop "$cid" >/dev/null; echo "$body"
  test "$body" = "{\"status\":\"ok\",\"version\":\"ci\",\"db\":\"ok\"}"' _ "$IMG_DB_FROM_CONTAINER" _ "${DOCKER_HOST_NET[@]}"
step "break-glass env" env VARDE_IMAGE=varde-api:ci bash infra/test/break-glass-env.test.sh
step "compose config" bash infra/test/compose-config.test.sh
step "backup roundtrip" bash infra/backup/test/backup.test.sh
step "caddy log+edge" bash -c 'bash infra/caddy/test/caddy-log.test.sh && bash infra/caddy/test/caddy-edge.test.sh'
step "metrics sampler" bash tools/metrics/test/vps-sample.test.sh

# job e2e (fresh databases; admin e2e leaves rounds behind)
mkdb varde_e2e; mkdb varde_e2e_runner
export DATABASE_URL="$URL/varde_e2e"
step "e2e db:migrate" pnpm --filter @varde/api db:migrate
step "e2e api build" pnpm --filter "@varde/api..." build
step "playwright install" pnpm --filter @varde/admin exec playwright install chromium
step "admin e2e" pnpm --filter @varde/admin e2e
step "runner e2e" env DATABASE_URL="$URL/varde_e2e_runner" pnpm --filter @varde/runner exec playwright test
step "golden" pnpm parity:golden --check

# job secrets
step "secrets" pnpm secrets
step "secrets:selfcheck" pnpm secrets:selfcheck

echo "== $PASS passed, $FAIL failed ${FAILED[*]:-}"
[ "$FAIL" -eq 0 ]
