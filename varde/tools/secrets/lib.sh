#!/usr/bin/env bash
# Shared helpers for tools/secrets/*.sh. Pinned gitleaks image (>= v8.19).
GITLEAKS_IMAGE="zricethezav/gitleaks:v8.30.1"

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"

# Runs gitleaks with the repository mounted at /repo. In a git worktree the common
# .git directory lives elsewhere; it is mounted read-only at its own absolute path so
# that `gitleaks git` can read history. safe.directory avoids "dubious ownership"
# because the container runs as a different uid.
gitleaks_run() {
  local common
  common="$(cd "$REPO_ROOT" && cd "$(git rev-parse --git-common-dir)" && pwd)"
  local mounts=(-v "$REPO_ROOT:/repo:ro")
  case "$common" in
    "$REPO_ROOT"/*) ;;
    *) mounts+=(-v "$common:$common:ro") ;;
  esac
  docker run --rm "${mounts[@]}" "${EXTRA_MOUNTS[@]+"${EXTRA_MOUNTS[@]}"}" \
    -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0='*' \
    "$GITLEAKS_IMAGE" "$@"
}
