#!/usr/bin/env bash
# Adds a ledger export (backup.sh ledger: deletion_request, deletion_tombstone, participant_tombstone as CSV)
# to a restored varde database; rows already there are kept (ON CONFLICT (id) DO NOTHING), so the result is
# the union of the dump's ledger and the export (ADR-016 delta 12.10). Then the app removes what the ledger
# names: `node dist/cli.js ledger apply-db` (runbook RESTORE.nn.md §4, step 6).
# Usage: ledger-merge.sh <directory with the three CSV files>   — target as in pgexec.sh.
# The CSV goes inline in one SQL stream (COPY … FROM STDIN), so it works through `docker exec` too.
# HEADER match: a ledger exported before a migration that changed these columns fails loudly here.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=pgexec.sh
. "$HERE/pgexec.sh"
DIR="${1:?usage: ledger-merge.sh <directory>}"
for t in deletion_request deletion_tombstone participant_tombstone; do
  [ -r "$DIR/$t.csv" ] || { echo "ERROR: $DIR/$t.csv is missing" >&2; exit 1; }
  # A line "\." would end the inline COPY early.
  if grep -qx '\\\.' "$DIR/$t.csv"; then echo "ERROR: $t.csv has a line '\\.'; merge by hand" >&2; exit 1; fi
done
{
  echo 'BEGIN;'
  echo 'CREATE TEMP TABLE l_request (LIKE public.deletion_request) ON COMMIT DROP;'
  echo 'CREATE TEMP TABLE l_tombstone (LIKE public.deletion_tombstone) ON COMMIT DROP;'
  echo 'CREATE TEMP TABLE l_participant (LIKE public.participant_tombstone) ON COMMIT DROP;'
  for pair in l_request:deletion_request l_tombstone:deletion_tombstone l_participant:participant_tombstone; do
    echo "COPY ${pair%%:*} FROM STDIN WITH (FORMAT csv, HEADER match);"
    cat "$DIR/${pair#*:}.csv"
    echo '\.'
  done
  cat <<'SQL'
WITH r AS (INSERT INTO public.deletion_request SELECT * FROM l_request ON CONFLICT (id) DO NOTHING RETURNING 1),
     t AS (INSERT INTO public.deletion_tombstone SELECT * FROM l_tombstone ON CONFLICT (id) DO NOTHING RETURNING 1),
     p AS (INSERT INTO public.participant_tombstone SELECT * FROM l_participant ON CONFLICT (id) DO NOTHING RETURNING 1)
SELECT 'ledger merged: requests +' || (SELECT count(*) FROM r) || ', tombstones +' || (SELECT count(*) FROM t)
    || ', participant tombstones +' || (SELECT count(*) FROM p);
COMMIT;
SQL
} | pg_psql -q -At -v ON_ERROR_STOP=1
