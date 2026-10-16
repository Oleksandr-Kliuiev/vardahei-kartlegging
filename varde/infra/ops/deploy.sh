#!/usr/bin/env bash
# Deploy of a commit to varde.vardahei.tech (varde/infra/README.md §2–§3). Usage: deploy.sh <sha12>
# The image varde-api:<sha12> must already be on the VPS (ship-image.sh). Stops at the first failure.
# Order matters: the new version is written to .env/VERSION only AFTER the migrations succeeded,
# so a failed migration leaves the running version and its pointer untouched.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"
SHA="${1:?usage: deploy.sh <sha12>}"
ROOT="${VARDE_ROOT:-$(cd "$HERE/../.." && pwd)}"
cd "$ROOT"
[ "$(git rev-parse --short=12 HEAD)" = "$SHA" ] || die "HEAD is not $SHA"
[ -z "$(git status --porcelain)" ] || die "the working tree is not clean"
PREV="$(remote "cat $REMOTE_DIR/VERSION")"
echo "== previous $PREV -> new $SHA"
remote "docker image inspect varde-api:$SHA --format '{{.Id}}' >/dev/null"
echo "== image present"
echo "== copy of the data"
ssh -T "$HOST" 'bash -s' < "$HERE/remote-backup.sh"
echo "== rsync infra, config, metrics"
rsync -a --exclude ops/ infra/ "$HOST:$REMOTE_DIR/"
rsync -a config/ "$HOST:$REMOTE_DIR/config/"
rsync -a tools/metrics/ "$HOST:$REMOTE_DIR/metrics/"
# VARDE_SHA in the environment overrides .env for these two commands only
remote "VARDE_SHA=$SHA $COMPOSE config --images"
echo "== migrations"
if ! remote "VARDE_SHA=$SHA $COMPOSE run --rm -T app node node_modules/prisma/build/index.js migrate deploy </dev/null"; then
  die "migration failed; $PREV is still running and .env/VERSION are unchanged. Copy of the data: see 'dir:' above. Rollback of a half-applied migration: rollback.sh $PREV <migration>"
fi
echo "== switching to $SHA"
remote "printf 'VARDE_SHA=%s\n' $SHA > $REMOTE_DIR/.env && echo $SHA > $REMOTE_DIR/VERSION"
remote "$COMPOSE up -d"
wait_healthy "$SHA" || die "the new version is not healthy; rollback.sh $PREV <migration of this release, if any>"
echo "== deployed $SHA"
