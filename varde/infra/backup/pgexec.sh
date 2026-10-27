# shellcheck shell=bash
# Sourced by restore.sh and ledger-merge.sh: psql and pg_restore on the target database, input on stdin.
# Without VARDE_RESTORE_CONTAINER: local binaries with PG* env (restore-check.sh's throwaway cluster).
# With VARDE_RESTORE_CONTAINER=<postgres container>: `docker exec` into it as its superuser over the unix
# socket, the only superuser path pg_hba allows to varde on the shared instance (ADR-016); the docker socket
# is mounted into the varde-backup container for this (runbook RESTORE.nn.md §4). PGOPTIONS goes along.
pg_psql() {
  if [ -n "${VARDE_RESTORE_CONTAINER:-}" ]; then
    docker exec -i -e PGOPTIONS="${PGOPTIONS:-}" "$VARDE_RESTORE_CONTAINER" \
      sh -c 'exec psql -X -U "${POSTGRES_USER:-postgres}" -d "$0" "$@"' "${PGDATABASE:-varde}" "$@"
  else
    psql -X "$@"
  fi
}
pg_restore_stdin() {
  if [ -n "${VARDE_RESTORE_CONTAINER:-}" ]; then
    docker exec -i -e PGOPTIONS="${PGOPTIONS:-}" "$VARDE_RESTORE_CONTAINER" \
      sh -c 'exec pg_restore -U "${POSTGRES_USER:-postgres}" -d "$0" "$@"' "${PGDATABASE:-varde}" "$@"
  else
    pg_restore -d "${PGDATABASE:-varde}" "$@"
  fi
}
