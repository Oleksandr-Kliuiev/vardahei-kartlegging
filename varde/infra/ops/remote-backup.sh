#!/usr/bin/env bash
# Runs ON THE VPS (ssh -T host 'bash -s' < remote-backup.sh): a copy of the varde database before a deploy.
# Unix socket inside atlas-db-1; the Atlas env is never read or printed.
# No `docker exec -i` here: it would eat the rest of this script from stdin.
set -euo pipefail
umask 077
W="${BACKUP_ROOT:-/root}/deploy-$(date -u +%Y%m%d-%H%M)"
install -d -m 0700 "$W"
docker exec atlas-db-1 sh -c 'pg_dump -U "${POSTGRES_USER:-postgres}" -d varde -Fc' > "$W/varde-pre.dump"
chmod 0600 "$W/varde-pre.dump"
test -s "$W/varde-pre.dump"
sha256sum "$W/varde-pre.dump" | cut -c1-16
# shellcheck disable=SC2012
ls -la "$W" | tail -1
q() { docker exec atlas-db-1 sh -c "exec psql -X -U \"\${POSTGRES_USER:-postgres}\" -d varde -tAc \"$1\""; }
echo "responses: $(q 'select count(*) from response')"
echo "snapshots: $(q 'select count(*) from aggregate_snapshot')"
echo "dir: $W"
