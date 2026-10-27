#!/usr/bin/env bash
# Restore check of one nightly copy (IMPROVEMENT-PLAN 0.1, ADR-016), on a key holder's machine, never on the
# VPS (it has only the public keys). Runs as root inside the varde-backup image:
#   docker run --rm -v <nightly dir>:/in:ro -v <age key>:/key:ro [-v <ledger dir>:/ledger:ro] \
#     -v <kit>:/kit:ro varde-backup:pg17-1 /kit/restore-check.sh /in /key [/ledger]
# Checks: the canary decrypts with this key; the dump decrypts and matches meta.json's sha256; it restores
# into a throwaway PostgreSQL in the container; every table has exactly meta.json's row count; with a ledger
# directory, its newest export merges (ledger-merge.sh). Prints the age of the copy and the time taken, for
# information only (no RPO/RTO targets, decision 13.10). Nothing is kept: the cluster lives in the container.
set -euo pipefail
umask 077
IN="${1:?usage: restore-check.sh <nightly dir> <age identity> [ledger dir]}"
KEY="${2:?usage: restore-check.sh <nightly dir> <age identity> [ledger dir]}"
LEDGER_DIR="${3:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PORT="${VARDE_CHECK_PORT:-5499}"
START="$(date +%s)"
W="$(mktemp -d)"
chmod 0755 "$W"
PGDATA_DIR="$W/pg"
stop() {
  su postgres -s /bin/sh -c "pg_ctl -D '$PGDATA_DIR' -m immediate stop" > /dev/null 2>&1 || true
  rm -rf "$W"
}
trap stop EXIT
die() {
  echo "FAIL: $*" >&2
  exit 1
}

for f in meta.json canary.age varde.dump.age; do [ -s "$IN/$f" ] || die "$IN/$f is missing (an unfinished run has no meta.json)"; done
jq -e '.format == 1' "$IN/meta.json" > /dev/null || die "meta.json: unknown format"
created="$(jq -r .created_at "$IN/meta.json")"

canary="$(age -d -i "$KEY" "$IN/canary.age")" || die "this key does not open canary.age (is it one of the recipients?)"
[ "$canary" = "varde-canary $created" ] || die "canary says '$canary', meta.json says $created"
echo "ok   canary opens with this key ($created)"

age -d -i "$KEY" -o "$W/varde.dump" "$IN/varde.dump.age"
[ "$(sha256sum "$W/varde.dump" | cut -d' ' -f1)" = "$(jq -r .dump_sha256 "$IN/meta.json")" ] || die "dump sha256 differs from meta.json"
echo "ok   dump decrypts, sha256 as in meta.json ($(stat -c %s "$W/varde.dump") bytes)"

install -d -o postgres -g postgres -m 0700 "$PGDATA_DIR" "$W/sock"
chown postgres "$W/varde.dump"
su postgres -s /bin/sh -c "initdb -D '$PGDATA_DIR' -U postgres --auth=trust -E UTF8 --locale=C > /dev/null 2>&1" || die "initdb failed"
su postgres -s /bin/sh -c "pg_ctl -D '$PGDATA_DIR' -o \"-p $PORT -k '$W/sock' -c listen_addresses=''\" -l '$W/sock/pg.log' -w start > /dev/null" || die "PostgreSQL did not start: $(tail -5 "$W/sock/pg.log")"
export PGHOST="$W/sock" PGPORT="$PORT" PGUSER=postgres PGDATABASE=varde
# The login event trigger (varde-db.sql) would log every check connection into varde_audit.connection_log
# and change its count; a superuser can switch event triggers off per session.
export PGOPTIONS="-c event_triggers=off"
createdb -T template0 varde
pg_restore --no-owner --no-acl --exit-on-error -d varde "$W/varde.dump"
echo "ok   pg_restore into a throwaway PostgreSQL $(postgres --version | awk '{print $3}') (server of the copy: $(jq -r .server_version "$IN/meta.json"))"

psql -X -At -v ON_ERROR_STOP=1 -f "$HERE/counts.sql" > "$W/counts.tsv"
jq -R -n '[inputs | split("\t") | {(.[0]): (.[1] | tonumber)}] | add // {}' < "$W/counts.tsv" > "$W/counts.json"
diff_out="$(jq -n --slurpfile a "$IN/meta.json" --slurpfile b "$W/counts.json" -r '
  ($a[0].counts) as $m | ($b[0]) as $r
  | (($m | keys) + ($r | keys) | unique)[]
  | select($m[.] != $r[.]) | "\(.): copy \($m[.] // "none"), restored \($r[.] // "none")"')"
[ -z "$diff_out" ] || die "row counts differ:"$'\n'"$diff_out"
echo "ok   $(jq 'length' "$W/counts.json") tables, row counts as in meta.json (responses: $(jq '."public.response" // "n/a"' "$W/counts.json"))"
migration="$(psql -X -At -c "SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at DESC, migration_name DESC LIMIT 1")"
[ "$migration" = "$(jq -r .last_migration "$IN/meta.json")" ] || die "last migration $migration, meta.json says $(jq -r .last_migration "$IN/meta.json")"
echo "ok   last migration $migration, image $(jq -r .image "$IN/meta.json")"

if [ -n "$LEDGER_DIR" ]; then
  newest="$(find "$LEDGER_DIR" -maxdepth 1 -name '*.tar.age' | sort | tail -1)"
  [ -n "$newest" ] || die "no *.tar.age in $LEDGER_DIR"
  mkdir "$W/ledger"
  age -d -i "$KEY" "$newest" | tar -C "$W/ledger" -xf -
  chmod -R a+rX "$W/ledger"
  echo "ok   $(bash "$HERE/ledger-merge.sh" "$W/ledger") from $(basename "$newest")"
fi

now="$(date +%s)"
then_s="$(date -u -d "$(echo "$created" | sed -E 's/^(....)(..)(..)T(..)(..)(..)Z$/\1-\2-\3 \4:\5:\6/')" +%s)"
echo "ok   restore check passed: copy is $(((now - then_s) / 3600)) h old, check took $((now - START)) s"
