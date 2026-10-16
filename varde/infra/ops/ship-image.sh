#!/usr/bin/env bash
# Builds the image of the current commit (linux/amd64) and loads it on the VPS (README §2).
# Usage: ship-image.sh <sha12>   — run from a clean checkout of that commit.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"
SHA="${1:?usage: ship-image.sh <sha12>}"
cd "${VARDE_ROOT:-$(cd "$HERE/../.." && pwd)}"
[ "$(git rev-parse --short=12 HEAD)" = "$SHA" ] || die "HEAD is not $SHA"
docker buildx build --platform linux/amd64 -f infra/Dockerfile . --build-arg "VARDE_VERSION=$SHA" -t "varde-api:$SHA" --load
# shellcheck disable=SC2029  # expanded on the operator machine on purpose
docker save "varde-api:$SHA" | gzip | ssh "$HOST" "cat > $REMOTE_DIR/images/varde-api-$SHA.tar.gz"
remote "gunzip -c $REMOTE_DIR/images/varde-api-$SHA.tar.gz | docker load"
