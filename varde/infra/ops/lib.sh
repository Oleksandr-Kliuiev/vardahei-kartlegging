# shellcheck shell=bash
# Shared helpers of the operator scripts (sourced, not run). The operator machine talks to the VPS over
# `ssh -T`; every remote command runs under `set -euo pipefail`, so a failing command can never be
# hidden by a pipe (`… | tail -2` used to turn a failed migration into success).
HOST="${VARDE_HOST:-vardahei-vps}"
REMOTE_DIR="${VARDE_REMOTE_DIR:-/opt/varde}"
HEALTH_URL="${VARDE_HEALTH_URL:-https://varde.vardahei.tech/health}"
COMPOSE="docker compose -f $REMOTE_DIR/compose.yml"

# remote <command string>: run it on the VPS in bash with errexit, nounset and pipefail.
remote() {
  ssh -T "$HOST" "bash -c $(printf '%q' "set -euo pipefail; $1")"
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

# wait_healthy <sha12>: the app container is (healthy) and /health reports the expected version.
# Fails (exit 1) on timeout; VARDE_WAIT_TRIES x VARDE_WAIT_SLEEP seconds (default 40 x 3).
wait_healthy() {
  local sha="$1" tries="${VARDE_WAIT_TRIES:-40}" pause="${VARDE_WAIT_SLEEP:-3}" st="" i
  for ((i = 1; i <= tries; i++)); do
    st="$(remote "$COMPOSE ps --format '{{.Status}}' app" || true)"
    case "$st" in *"(healthy)"*) break ;; esac
    st=""
    sleep "$pause"
  done
  [ -n "$st" ] || die "the app did not become healthy in $((tries * pause)) s (docker compose logs --tail 50 app)"
  echo "== $st"
  local body
  body="$(curl -fsS "$HEALTH_URL")" || die "$HEALTH_URL does not answer 200"
  echo "$body"
  case "$body" in *"$sha"*) ;; *) die "/health does not report version $sha" ;; esac
}
