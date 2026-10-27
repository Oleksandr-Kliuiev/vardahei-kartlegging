#!/usr/bin/env bash
# Backup of the varde database (IMPROVEMENT-PLAN 0.1, ADR-016). Runs inside the varde-backup image
# (`docker compose --profile backup run --rm -T backup /kit/backup.sh <mode>`, systemd units in systemd/):
#   nightly  pg_dump -Fc as varde_backup in one snapshot with the row count of every table → age to every
#            key in recipients.txt → rclone to $VARDE_BACKUP_REMOTE/nightly/<ts>/ (dump, canary, kit, meta.json
#            last), the api image once per sha to images/, rotation (35 days), heartbeat ping
#   ledger   the deletion ledger (three tables as CSV, one snapshot) → age → ledger/<ts>.tar.age, only when it
#            changed since the last upload; never rotated (ADR-017). A restore applies the newest one, so a
#            deletion made after the night's dump survives the restore.
# Env (/etc/varde/backup.env): PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE (bootstrap.sh), VARDE_BACKUP_REMOTE
# (rclone remote and path, e.g. vardebackup:varde), VARDE_BACKUP_HEARTBEAT_URL and VARDE_LEDGER_HEARTBEAT_URL
# (optional, healthchecks style: GET on success, GET <url>/fail on failure).
# Nothing in plain text outlives the run: the work directory is removed on exit.
set -euo pipefail
umask 077
HERE="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:?usage: backup.sh nightly|ledger}"
REMOTE="${VARDE_BACKUP_REMOTE:?VARDE_BACKUP_REMOTE is not set}"
RECIPIENTS="${VARDE_BACKUP_RECIPIENTS:-/run/varde/recipients.txt}"
MIN_RECIPIENTS="${VARDE_BACKUP_MIN_RECIPIENTS:-3}"
KEEP_DAYS="${VARDE_BACKUP_KEEP_DAYS:-35}"
KEEP_MIN="${VARDE_BACKUP_KEEP_MIN:-7}"
STATE="${VARDE_BACKUP_STATE:-/var/lib/varde-backup}"
VERSION_FILE="${VARDE_BACKUP_VERSION_FILE:-/run/varde/VERSION}"
IMAGES="${VARDE_BACKUP_IMAGES:-/run/varde/images}"
KIT="${VARDE_BACKUP_KIT:-/kit}"
export RCLONE_CONFIG="${RCLONE_CONFIG:-/run/varde/rclone/rclone.conf}"
LEDGER_TABLES=(deletion_request deletion_tombstone participant_tombstone)
TS="$(date -u +%Y%m%dT%H%M%SZ)"
W="$(mktemp -d)"

log() { echo "$(date -u +%H:%M:%S) $*"; }
die() {
  echo "ERROR: $*" >&2
  exit 1
}
# heartbeat ok|fail: the heartbeat of this mode; a failing ping is a warning, never the run's result.
heartbeat() {
  local url
  if [ "$MODE" = nightly ]; then url="${VARDE_BACKUP_HEARTBEAT_URL:-}"; else url="${VARDE_LEDGER_HEARTBEAT_URL:-}"; fi
  [ -n "$url" ] || return 0
  [ "$1" = fail ] && url="$url/fail"
  curl -fsS -m 10 --retry 3 -o /dev/null "$url" || echo "WARN: heartbeat ping failed" >&2
}
finish() {
  local rc=$?
  rm -rf "$W"
  [ "$rc" -eq 0 ] || heartbeat fail
  exit "$rc"
}
trap finish EXIT

check_recipients() {
  [ -r "$RECIPIENTS" ] || die "$RECIPIENTS is not readable"
  local n
  n="$(grep -cE '^age1[0-9a-z]{58}$' "$RECIPIENTS" || true)"
  [ "$n" -ge "$MIN_RECIPIENTS" ] || die "$RECIPIENTS has $n age keys, $MIN_RECIPIENTS needed (ADR-016: Oleksandr, Asbjørn, Bjarte)"
  # Every non-comment line must be a key: age -R would refuse it anyway, but later and less clearly.
  if grep -vE '^(#.*|age1[0-9a-z]{58}|)$' "$RECIPIENTS" >/dev/null; then die "$RECIPIENTS has a line that is not an age key"; fi
  echo "$n"
}
enc() { age -R "$RECIPIENTS" -o "$2" "$1"; }

# Row counts (counts.sql) and the last migration, from the dump's snapshot.
COUNTS_SQL="$(grep -v '^--' "$HERE/counts.sql" | tr '\n' ' ')"
# Owner of the login event trigger (a superuser of the source instance): restore.sh creates it when missing.
EVT_OWNER_SQL="SELECT coalesce((SELECT evtowner::regrole::text FROM pg_event_trigger WHERE evtname = 'varde_login'), '');"
LAST_MIGRATION_SQL="SELECT coalesce((SELECT migration_name FROM public._prisma_migrations
  WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at DESC, migration_name DESC LIMIT 1), '');"

# dump: $W/varde.dump plus $W/counts.tsv, $W/migration, $W/server from the same snapshot (pg_dump --snapshot
# of a REPEATABLE READ transaction held open by a psql coprocess), so restore-check can compare exactly.
dump() {
  local snap line pid
  # stderr apart: a WARNING (the login trigger never blocks a login, it warns) must not break the parsing.
  coproc PSQL { psql -X -q -At -v ON_ERROR_STOP=1 2> "$W/psql.err"; }
  pid=$PSQL_PID
  # lock_timeout and --lock-wait-timeout: a migration's ALTER waiting behind this session's locks would
  # otherwise queue pg_dump (and every app query) behind itself, a deadlock PostgreSQL cannot see.
  printf '%s\n' "SET lock_timeout = '60s';" "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;" "SELECT pg_export_snapshot();" >&"${PSQL[1]}"
  IFS= read -r -t 60 snap <&"${PSQL[0]}" || die "psql gave no snapshot: $(cat "$W/psql.err")"
  [[ "$snap" =~ ^[0-9A-F]+-[0-9A-F]+-[0-9]+$ ]] || die "psql: $snap"
  printf '%s\n' "SHOW server_version;" "$LAST_MIGRATION_SQL" "$EVT_OWNER_SQL" "$COUNTS_SQL" "SELECT '--end--';" >&"${PSQL[1]}"
  IFS= read -r -t 60 line <&"${PSQL[0]}" || die "psql gave no server version"
  printf '%s\n' "$line" > "$W/server"
  IFS= read -r -t 60 line <&"${PSQL[0]}" || die "psql gave no migration"
  printf '%s\n' "$line" > "$W/migration"
  IFS= read -r -t 60 line <&"${PSQL[0]}" || die "psql gave no event trigger owner"
  printf '%s\n' "$line" > "$W/evtowner"
  : > "$W/counts.tsv"
  while IFS= read -r -t 600 line <&"${PSQL[0]}"; do
    [ "$line" = "--end--" ] && break
    [[ "$line" == *$'\t'* ]] || die "psql: $line"
    printf '%s\n' "$line" >> "$W/counts.tsv"
  done
  [ "$line" = "--end--" ] || die "row counts did not finish: $(cat "$W/psql.err")"
  pg_dump -Fc --snapshot="$snap" --lock-wait-timeout=60s -f "$W/varde.dump"
  printf '%s\n' "COMMIT;" '\q' >&"${PSQL[1]}"
  wait "$pid" || die "psql session failed"
  pg_restore -l "$W/varde.dump" > /dev/null
}

nightly() {
  local n version up="$W/up" sha bytes dir img
  n="$(check_recipients)"
  version="$(tr -dc '0-9a-f' < "$VERSION_FILE")"
  [ -n "$version" ] || die "no version in $VERSION_FILE"
  log "dump of $PGDATABASE (image $version)"
  dump
  sha="$(sha256sum "$W/varde.dump" | cut -d' ' -f1)"
  bytes="$(stat -c %s "$W/varde.dump")"
  mkdir "$up"
  enc "$W/varde.dump" "$up/varde.dump.age"
  rm -f "$W/varde.dump"
  printf 'varde-canary %s\n' "$TS" | age -R "$RECIPIENTS" -o "$up/canary.age"
  tar -C "$KIT" --exclude=./test -czf "$up/kit.tar.gz" .
  jq -n --arg ts "$TS" --arg image "$version" --arg migration "$(cat "$W/migration")" \
    --arg server "$(cat "$W/server")" --arg evtowner "$(cat "$W/evtowner")" --arg sha "$sha" --argjson bytes "$bytes" --argjson n "$n" \
    --argjson counts "$(jq -R -n '[inputs | split("\t") | {(.[0]): (.[1] | tonumber)}] | add // {}' < "$W/counts.tsv")" \
    '{format: 1, created_at: $ts, image: $image, last_migration: $migration, server_version: $server,
      event_trigger_owner: $evtowner, dump_sha256: $sha, dump_bytes: $bytes, recipients: $n, counts: $counts}' > "$W/meta.json"
  dir="$REMOTE/nightly/$TS"
  log "upload to nightly/$TS"
  rclone copy --retries 3 "$up" "$dir"
  rclone check --one-way "$up" "$dir"
  img="$IMAGES/varde-api-$version.tar.gz"
  if [ -z "$(rclone lsf "$REMOTE/images" --include "varde-api-$version.tar.gz" 2> /dev/null)" ]; then
    [ -s "$img" ] || die "$img is missing: deputies could not run the restored database"
    log "upload images/varde-api-$version.tar.gz"
    rclone copyto --retries 3 "$img" "$REMOTE/images/varde-api-$version.tar.gz"
  fi
  # meta.json last: a nightly directory without it is an unfinished run and is never restored from.
  rclone copyto --retries 3 "$W/meta.json" "$dir/meta.json"
  rotate "$version"
  heartbeat ok
  log "done: nightly/$TS, $(jq '.counts | length' "$W/meta.json") tables, dump $bytes bytes"
}

# rotate <current image sha>: nightly directories older than KEEP_DAYS go (never the newest KEEP_MIN finished
# ones), then every image no remaining meta.json names. Every listing is checked before anything is deleted:
# a failed or cut listing (mapfile < <(…) would hide rclone's status) stops the rotation as a failed run.
rotate() {
  local cutoff d sha
  cutoff="$(date -u -d "@$(($(date +%s) - KEEP_DAYS * 86400))" +%Y%m%dT%H%M%SZ)"
  rclone lsf --dirs-only "$REMOTE/nightly" > "$W/dirs" || die "rotation: listing nightly/ failed, nothing deleted"
  rclone lsf -R --files-only --include '*/meta.json' "$REMOTE/nightly" > "$W/metas" || die "rotation: listing meta.json failed, nothing deleted"
  sed 's:/meta.json$::' "$W/metas" | sort | tail -n "$KEEP_MIN" > "$W/keep"
  [ -s "$W/keep" ] || die "rotation: no finished copy listed, nothing deleted"
  while IFS= read -r d; do
    d="${d%/}"
    [[ "$d" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || continue
    if [[ "$d" < "$cutoff" ]] && ! grep -qx "$d" "$W/keep"; then
      log "rotation: nightly/$d"
      rclone purge "$REMOTE/nightly/$d"
    fi
  done < <(sort "$W/dirs")
  rclone lsf -R --files-only --include '*/meta.json' "$REMOTE/nightly" > "$W/metas" || die "rotation: listing meta.json failed, no image deleted"
  printf '%s\n' "$1" > "$W/shas"
  while IFS= read -r d; do
    rclone cat "$REMOTE/nightly/$d" > "$W/m.json" || die "rotation: reading $d failed, no image deleted"
    sha="$(jq -r '.image // empty' "$W/m.json")" || die "rotation: $d is not JSON, no image deleted"
    [ -n "$sha" ] || die "rotation: $d names no image, no image deleted"
    printf '%s\n' "$sha" >> "$W/shas"
  done < "$W/metas"
  rclone lsf --files-only "$REMOTE/images" > "$W/images" || die "rotation: listing images/ failed, no image deleted"
  while IFS= read -r d; do
    [[ "$d" =~ ^varde-api-([0-9a-f]+)\.tar\.gz$ ]] || continue
    if ! grep -qx "${BASH_REMATCH[1]}" "$W/shas"; then
      log "rotation: images/$d"
      rclone deletefile "$REMOTE/images/$d"
    fi
  done < "$W/images"
}

ledger() {
  local t sql="BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;"$'\n' sum
  check_recipients > /dev/null
  mkdir "$W/ledger"
  for t in "${LEDGER_TABLES[@]}"; do
    sql+="\\copy (SELECT * FROM public.$t ORDER BY id) TO '$W/ledger/$t.csv' WITH (FORMAT csv, HEADER true)"$'\n'
  done
  sql+="COMMIT;"
  psql -X -q -v ON_ERROR_STOP=1 <<< "$sql"
  sum="$(cd "$W/ledger" && sha256sum "${LEDGER_TABLES[@]/%/.csv}" | sha256sum | cut -d' ' -f1)"
  if [ -f "$STATE/ledger.sha256" ] && [ "$(cat "$STATE/ledger.sha256")" = "$sum" ]; then
    log "ledger unchanged"
    heartbeat ok
    return 0
  fi
  tar -C "$W/ledger" -cf "$W/ledger.tar" .
  enc "$W/ledger.tar" "$W/ledger.tar.age"
  rclone copyto --retries 3 "$W/ledger.tar.age" "$REMOTE/ledger/$TS.tar.age"
  printf '%s\n' "$sum" > "$STATE/ledger.sha256"
  heartbeat ok
  log "ledger: ledger/$TS.tar.age ($(for t in "${LEDGER_TABLES[@]}"; do printf '%s %s ' "$t" "$(($(wc -l < "$W/ledger/$t.csv") - 1))"; done))"
}

# One run at a time: nightly and ledger share the state directory, so varde_backup (CONNECTION LIMIT 3) never
# has more than two connections from here.
mkdir -p "$STATE"
exec 9> "$STATE/lock"
flock -w 1800 9 || die "another backup run holds $STATE/lock"

case "$MODE" in
  nightly) nightly ;;
  ledger) ledger ;;
  *) die "usage: backup.sh nightly|ledger" ;;
esac
