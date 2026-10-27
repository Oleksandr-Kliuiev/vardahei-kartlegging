#!/usr/bin/env bash
# Restore of one nightly copy into a prepared varde database (IMPROVEMENT-PLAN 0.1, ADR-016; runbook
# RESTORE.nn.md). Runs in the varde-backup image as a PostgreSQL superuser:
#   restore.sh <nightly dir> <age identity> [ledger dir]
# Target: VARDE_RESTORE_CONTAINER=<postgres container> (docker exec over its unix socket, docker socket
# mounted; the shared instance allows superusers no other way) or local PG* env (pgexec.sh).
# The target database must exist with the roles of varde-roles.sql and varde-db.sql applied (bootstrap.sh on
# a new instance, or a renamed old database plus `CREATE DATABASE` and varde-db.sql on the same one), have no
# tables in public yet and no app or backup timer running against it. The copy brings every object with its
# owner and grants, in one transaction (a failure leaves the database as it was, so a rerun works); the owner
# of the login event trigger is created first when the instance lacks it. The newest ledger export is then
# merged (ledger-merge.sh). After it: `ledger apply-db` and `retention run` (runbook §4, step 6).
set -euo pipefail
umask 077
IN="${1:?usage: restore.sh <nightly dir> <age identity> [ledger dir]}"
KEY="${2:?usage: restore.sh <nightly dir> <age identity> [ledger dir]}"
LEDGER_DIR="${3:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=pgexec.sh
. "$HERE/pgexec.sh"
W="$(mktemp -d)"
trap 'rm -rf "$W"' EXIT
die() {
  echo "FAIL: $*" >&2
  exit 1
}
q() { pg_psql -q -At -v ON_ERROR_STOP=1 -c "$1"; }
for f in meta.json varde.dump.age; do [ -s "$IN/$f" ] || die "$IN/$f is missing (an unfinished run has no meta.json)"; done
# Event triggers off (superuser only): the login trigger must not fire while its table is replaced.
export PGOPTIONS="-c event_triggers=off"
[ "$(q 'SELECT rolsuper FROM pg_roles WHERE rolname = current_user')" = t ] || die "restore needs a superuser connection"
existing="$(q "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")"
[ "$existing" = 0 ] || die "database ${PGDATABASE:-varde} already has $existing tables in public; restore into a fresh one"

age -d -i "$KEY" -o "$W/varde.dump" "$IN/varde.dump.age"
[ "$(sha256sum "$W/varde.dump" | cut -d' ' -f1)" = "$(jq -r .dump_sha256 "$IN/meta.json")" ] || die "dump sha256 differs from meta.json"

owner="$(jq -r '.event_trigger_owner // empty' "$IN/meta.json")"
if [ -n "$owner" ]; then
  [[ "$owner" =~ ^[a-z_][a-z0-9_]*$ ]] || die "event trigger owner '$owner' is not a plain role name"
  if [ "$(q "SELECT count(*) FROM pg_roles WHERE rolname = '$owner'")" = 0 ]; then
    # ALTER EVENT TRIGGER … OWNER TO needs a superuser; NOLOGIN: nobody signs in as it.
    q "CREATE ROLE $owner NOLOGIN SUPERUSER"
    echo "ok   created role $owner (NOLOGIN SUPERUSER), owner of the login event trigger on the source"
  fi
fi
# bootstrap.sh has already created varde_audit with the login trigger; the copy brings its own (with the
# journal rows), so the empty ones go first. Default privileges and the public grants are the same in both.
q "DROP EVENT TRIGGER IF EXISTS varde_login; DROP SCHEMA IF EXISTS varde_audit CASCADE;"
pg_restore_stdin --exit-on-error --single-transaction < "$W/varde.dump"
rm -f "$W/varde.dump"
echo "ok   restored nightly $(jq -r .created_at "$IN/meta.json") into ${PGDATABASE:-varde} (image $(jq -r .image "$IN/meta.json"), migration $(jq -r .last_migration "$IN/meta.json"))"

pg_psql -At -v ON_ERROR_STOP=1 < "$HERE/counts.sql" > "$W/counts.tsv"
jq -R -n '[inputs | split("\t") | {(.[0]): (.[1] | tonumber)}] | add // {}' < "$W/counts.tsv" > "$W/counts.json"
diff_out="$(jq -n --slurpfile a "$IN/meta.json" --slurpfile b "$W/counts.json" -r '
  ($a[0].counts) as $m | ($b[0]) as $r | ($m | keys)[] | select($m[.] != $r[.]) | "\(.): copy \($m[.]), restored \($r[.] // "none")"')"
[ -z "$diff_out" ] || die "row counts differ:"$'\n'"$diff_out"
echo "ok   row counts as in meta.json"

if [ -n "$LEDGER_DIR" ]; then
  newest="$(find "$LEDGER_DIR" -maxdepth 1 -name '*.tar.age' | sort | tail -1)"
  [ -n "$newest" ] || die "no *.tar.age in $LEDGER_DIR"
  mkdir "$W/ledger"
  age -d -i "$KEY" "$newest" | tar -C "$W/ledger" -xf -
  echo "ok   $(bash "$HERE/ledger-merge.sh" "$W/ledger") from $(basename "$newest")"
else
  echo "WARN no ledger directory: deletions made after this copy are not applied" >&2
fi
