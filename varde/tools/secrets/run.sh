#!/usr/bin/env bash
# Secret-scan of the Varde area with gitleaks in Docker (no local install).
# Same flags locally and in CI. Usage: tools/secrets/run.sh [dir|git|all]  (default: all)
set -euo pipefail
source "$(dirname "$0")/lib.sh"

mode="${1:-all}"
status=0
if [[ "$mode" == dir || "$mode" == all ]]; then
  echo "== gitleaks dir /repo/varde"
  gitleaks_run dir /repo/varde --config /repo/varde/.gitleaks.toml --redact --no-banner \
    --gitleaks-ignore-path /repo/varde/.gitleaksignore || status=1
fi
if [[ "$mode" == git || "$mode" == all ]]; then
  if [[ "$(git -C "$REPO_ROOT" rev-parse --is-shallow-repository)" == true ]]; then
    echo "error: shallow clone: the history scan needs full history (checkout fetch-depth: 0)" >&2
    exit 1
  fi
  echo "== gitleaks git /repo (paths: varde docs/varde .github)"
  gitleaks_run git /repo --config /repo/varde/.gitleaks.toml --redact --no-banner \
    --gitleaks-ignore-path /repo/varde/.gitleaksignore \
    --log-opts="-- varde docs/varde .github" || status=1
fi
exit "$status"
