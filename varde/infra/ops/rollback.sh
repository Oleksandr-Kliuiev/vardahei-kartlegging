#!/usr/bin/env bash
# Rollback of a deploy (only if the checks after it fail): the previous image, then the hand-written
# down.sql of the migrations of the release through the unix socket of atlas-db-1, newest first.
# Usage: rollback.sh <previous sha12> [<migration dir name> ...]   (e.g. 20261016160000_seminar_rounds)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"
PREV="${1:?usage: rollback.sh <previous sha12> [<migration> ...]}"
shift
ROOT="${VARDE_ROOT:-$(cd "$HERE/../.." && pwd)}"
MIG="$ROOT/apps/api/prisma/migrations"
for m in "$@"; do [ -s "$MIG/$m/down.sql" ] || die "no down.sql for $m"; done
remote "printf 'VARDE_SHA=%s\n' $PREV > $REMOTE_DIR/.env && echo $PREV > $REMOTE_DIR/VERSION"
remote "$COMPOSE up -d"
for m in "$@"; do
  echo "== down $m"
  ssh -T "$HOST" "docker exec -i atlas-db-1 sh -c 'psql -X -U \"\${POSTGRES_USER:-postgres}\" -d varde -v ON_ERROR_STOP=1'" < "$MIG/$m/down.sql"
done
wait_healthy "$PREV"
echo "== rolled back to $PREV"
