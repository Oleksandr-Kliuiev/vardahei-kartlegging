#!/usr/bin/env bash
# shellcheck disable=SC2015  # `check && ok || bad`: ok never fails
# Inside the varde-backup image (backup.test.sh starts it): a source PostgreSQL with the varde roles, the
# login event trigger and the ledger tables, an rclone "local" remote instead of SharePoint, three test age
# keys. Real backup.sh → real restore-check.sh, plus the failures that must stop a run.
set -uo pipefail
KIT=/kit
T="$(mktemp -d)"
chmod 0755 "$T"
FAILS=0
ok() { echo "ok   $1"; }
bad() {
  echo "FAIL $1"
  FAILS=$((FAILS + 1))
}

# Source cluster, as on the VPS: the real varde-roles.sql and varde-db.sql (read-only varde_backup, audit schema
# with the login event trigger, which logs every connection of varde_backup), then app tables as varde_app.
install -d -o postgres -m 0700 "$T/src"
su postgres -s /bin/sh -c "initdb -D '$T/src' -U postgres --auth=trust -E UTF8 --locale=C > /dev/null 2>&1"
su postgres -s /bin/sh -c "pg_ctl -D '$T/src' -o \"-p 5432 -k /tmp -c listen_addresses=''\" -w start > /dev/null"
SU() { psql -X -q -h /tmp -U postgres -v ON_ERROR_STOP=1 "$@"; }
{ printf '\\set app_pw a0\n\\set backup_pw b0\n\\set role_limit 10\n'; cat /sql/varde-roles.sql; } | SU -d postgres > /dev/null
SU -d varde < /sql/varde-db.sql > /dev/null
# The login trigger belongs to the instance's superuser, which on the VPS is not called postgres.
SU -d varde -c "CREATE ROLE atlas NOLOGIN SUPERUSER; ALTER EVENT TRIGGER varde_login OWNER TO atlas;"
SU -d varde <<'SQL'
SET ROLE varde_app;
CREATE TABLE _prisma_migrations (id text PRIMARY KEY, migration_name text NOT NULL, finished_at timestamptz, rolled_back_at timestamptz);
INSERT INTO _prisma_migrations VALUES ('1', '20261014100000_a', now() - interval '1 day', NULL), ('2', '20261018100000_b', now(), NULL);
CREATE TABLE response (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), body jsonb NOT NULL);
INSERT INTO response (body) SELECT jsonb_build_object('n', g) FROM generate_series(1, 57) g;
CREATE TABLE aggregate_snapshot (id serial PRIMARY KEY, cells jsonb);
INSERT INTO aggregate_snapshot (cells) SELECT '{}' FROM generate_series(1, 12);
CREATE TABLE deletion_request (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), requested_by text NOT NULL, reason text NOT NULL,
  scope text NOT NULL, scope_ref jsonb NOT NULL, at timestamptz NOT NULL DEFAULT now());
CREATE TABLE deletion_tombstone (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES deletion_request(id),
  submission_id uuid NOT NULL, content_hash text NOT NULL, round_id uuid NOT NULL, client_id uuid NOT NULL, part text NOT NULL,
  source_id text, respondent_key text);
CREATE TABLE participant_tombstone (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES deletion_request(id),
  contact_id uuid NOT NULL, registrations int NOT NULL);
WITH r AS (INSERT INTO deletion_request (requested_by, reason, scope, scope_ref) VALUES ('admin', 'test, with "quotes"', 'respondent', '{"k": "a,b"}') RETURNING id)
INSERT INTO deletion_tombstone (request_id, submission_id, content_hash, round_id, client_id, part) SELECT id, gen_random_uuid(), 'h', gen_random_uuid(), gen_random_uuid(), 'all' FROM r;
SQL

age-keygen -o "$T/k1" 2> /dev/null
age-keygen -o "$T/k2" 2> /dev/null
age-keygen -o "$T/k3" 2> /dev/null
age-keygen -o "$T/other" 2> /dev/null
{ echo '# test recipients'; for k in k1 k2 k3; do age-keygen -y "$T/$k"; done; } > "$T/recipients.txt"
mkdir -p "$T/images" "$T/remote" "$T/state" "$T/bin"
echo 0123456789ab > "$T/VERSION"
echo image > "$T/images/varde-api-0123456789ab.tar.gz"
# curl stub: records heartbeat pings
printf '#!/bin/sh\necho "$*" >> %s/pings\n' "$T" > "$T/bin/curl"
chmod +x "$T/bin/curl"
: > "$T/rclone.conf"

run_backup() {
  env PATH="$T/bin:$PATH" PGHOST=/tmp PGPORT=5432 PGUSER=varde_backup PGDATABASE=varde \
    VARDE_BACKUP_REMOTE="dest:$T/remote" RCLONE_CONFIG="$T/rclone.conf" RCLONE_CONFIG_DEST_TYPE=local \
    VARDE_BACKUP_RECIPIENTS="$T/recipients.txt" VARDE_BACKUP_VERSION_FILE="$T/VERSION" VARDE_BACKUP_IMAGES="$T/images" \
    VARDE_BACKUP_STATE="$T/state" VARDE_BACKUP_KEEP_MIN=1 VARDE_BACKUP_HEARTBEAT_URL=https://hb.example/n \
    VARDE_LEDGER_HEARTBEAT_URL=https://hb.example/l "$@" > "$T/out" 2>&1
}
check() { bash "$KIT/restore-check.sh" "$@" > "$T/check" 2>&1; }

# Old copies for the rotation: one older than 35 days (goes), its image (goes), one unfinished recent run (stays).
mkdir -p "$T/remote/nightly/20200101T000000Z" "$T/remote/nightly/29990101T000000Z" "$T/remote/images"
echo '{"image":"aaaaaaaaaaaa"}' > "$T/remote/nightly/20200101T000000Z/meta.json"
echo x > "$T/remote/images/varde-api-aaaaaaaaaaaa.tar.gz"
echo x > "$T/remote/nightly/29990101T000000Z/varde.dump.age"

if run_backup bash "$KIT/backup.sh" nightly; then ok "nightly backup runs"; else bad "nightly backup: $(cat "$T/out")"; fi
N="$(find "$T/remote/nightly" -name meta.json -path '*/2026*' -o -name meta.json -path '*/20[3-9]*' | grep -v 2999 | head -1 | xargs dirname)"
[ -n "$N" ] && [ -f "$N/varde.dump.age" ] && [ -f "$N/canary.age" ] && [ -f "$N/kit.tar.gz" ] && ok "nightly dir has dump, canary, kit, meta" || bad "nightly dir: $(ls -R "$T/remote")"
[ "$(jq -r '.counts."public.response"' "$N/meta.json")" = 57 ] && ok "meta counts 57 responses" || bad "meta: $(cat "$N/meta.json")"
[ "$(jq -r .last_migration "$N/meta.json")" = 20261018100000_b ] && [ "$(jq -r .recipients "$N/meta.json")" = 3 ] && [ "$(jq -r .event_trigger_owner "$N/meta.json")" = atlas ] && ok "meta: last migration, 3 recipients, trigger owner" || bad "meta migration/recipients"
[ "$(jq -r '.counts."varde_audit.connection_log"' "$N/meta.json")" -ge 1 ] && ok "login trigger logged connections, counted in the dump's snapshot" || bad "connection_log count"
head -c 21 "$N/varde.dump.age" | grep -q 'age-encryption.org/v1' && ok "dump is age-encrypted" || bad "dump not age"
tar -tzf "$N/kit.tar.gz" | grep -q 'restore-check.sh' && ! tar -tzf "$N/kit.tar.gz" | grep -q '^./test' && ok "kit has the scripts, not the tests" || bad "kit: $(tar -tzf "$N/kit.tar.gz")"
[ -f "$T/remote/images/varde-api-0123456789ab.tar.gz" ] && ok "image uploaded" || bad "image not uploaded"
[ ! -e "$T/remote/nightly/20200101T000000Z" ] && [ ! -e "$T/remote/images/varde-api-aaaaaaaaaaaa.tar.gz" ] && ok "rotation: old copy and its image gone" || bad "rotation left old copy"
[ -e "$T/remote/nightly/29990101T000000Z" ] && ok "rotation keeps a recent unfinished run" || bad "rotation removed a recent dir"
grep -q ' https://hb.example/n$' "$T/pings" 2> /dev/null && ok "heartbeat pinged" || bad "no heartbeat: $(cat "$T/pings" 2> /dev/null)"
[ -z "$(find /tmp -maxdepth 2 -name 'varde.dump' 2> /dev/null)" ] && ok "no plain dump left" || bad "plain dump left"

# A failing read during rotation deletes no image: rclone cat fails, the old image stays, the run fails.
echo x > "$T/remote/images/varde-api-bbbbbbbbbbbb.tar.gz"
mkdir -p "$T/rbin"
# shellcheck disable=SC2016  # the stub expands $1 and $@ itself
printf '#!/bin/sh\n[ "$1" = cat ] && exit 5\nexec %s "$@"\n' "$(command -v rclone)" > "$T/rbin/rclone"
chmod +x "$T/rbin/rclone"
run_backup env PATH="$T/rbin:$T/bin:$PATH" bash "$KIT/backup.sh" nightly && bad "rotation with a failing read passed" || { grep -q 'no image deleted' "$T/out" && [ -f "$T/remote/images/varde-api-bbbbbbbbbbbb.tar.gz" ] && ok "failed rotation read deletes no image" || bad "rotation read: $(cat "$T/out")"; }
rm -f "$T/remote/images/varde-api-bbbbbbbbbbbb.tar.gz"

# Ledger: first export uploads, unchanged is skipped, a deletion after the dump makes a new export.
run_backup bash "$KIT/backup.sh" ledger && [ "$(find "$T/remote/ledger" -name '*.tar.age' | wc -l)" -eq 1 ] && ok "ledger exported" || bad "ledger: $(cat "$T/out")"
sleep 1
run_backup bash "$KIT/backup.sh" ledger && grep -q 'ledger unchanged' "$T/out" && [ "$(find "$T/remote/ledger" -name '*.tar.age' | wc -l)" -eq 1 ] && ok "unchanged ledger not uploaded" || bad "ledger unchanged: $(cat "$T/out")"
SU -d varde -c "SET ROLE varde_app; WITH r AS (INSERT INTO deletion_request (requested_by, reason, scope, scope_ref) VALUES ('admin', 'after dump', 'participant', '{}') RETURNING id) INSERT INTO participant_tombstone (request_id, contact_id, registrations) SELECT id, gen_random_uuid(), 2 FROM r;"
sleep 1
run_backup bash "$KIT/backup.sh" ledger && [ "$(find "$T/remote/ledger" -name '*.tar.age' | wc -l)" -eq 2 ] && ok "changed ledger uploaded" || bad "ledger change: $(cat "$T/out")"

# Restore check with each holder's key, and with the ledger.
if check "$N" "$T/k2"; then ok "restore check passes with key 2"; else bad "restore check: $(cat "$T/check")"; fi
grep -q 'row counts as in meta.json (responses: 57)' "$T/check" && ok "restore check compared counts" || bad "counts line: $(cat "$T/check")"
if check "$N" "$T/k3" "$T/remote/ledger"; then ok "restore check with ledger"; else bad "restore check ledger: $(cat "$T/check")"; fi
grep -q 'requests +1, tombstones +0, participant tombstones +1' "$T/check" && ok "ledger merge adds only the deletion after the dump" || bad "merge: $(cat "$T/check")"

# Real restore (restore.sh) into a new instance prepared like bootstrap.sh does: varde-roles.sql, varde-db.sql.
install -d -o postgres -m 0700 "$T/new"
su postgres -s /bin/sh -c "initdb -D '$T/new' -U postgres --auth=trust -E UTF8 --locale=C > /dev/null 2>&1"
su postgres -s /bin/sh -c "pg_ctl -D '$T/new' -o \"-p 5433 -k /tmp -c listen_addresses=''\" -w start > /dev/null"
NEW() { psql -X -q -At -h /tmp -p 5433 -U postgres -v ON_ERROR_STOP=1 "$@"; }
{ printf '\\set app_pw a1\n\\set backup_pw b1\n\\set role_limit 10\n'; cat /sql/varde-roles.sql; } | NEW -d postgres > /dev/null
NEW -d varde < /sql/varde-db.sql > /dev/null
# docker stub: `docker exec -i -e PGOPTIONS=… <container> sh -c <script> <db> …` runs the script against the new
# instance, as the real one runs it over the socket inside the PostgreSQL container.
mkdir -p "$T/dbin"
cat > "$T/dbin/docker" <<'STUB'
#!/bin/sh
[ "$1" = exec ] || exit 99
shift
[ "$1" = -i ] && shift
[ "$1" = -e ] && { export "$2"; shift 2; }
shift
exec env PGHOST=/tmp PGPORT=5433 POSTGRES_USER=postgres "$@"
STUB
chmod +x "$T/dbin/docker"
restore() { env PATH="$T/dbin:$PATH" VARDE_RESTORE_CONTAINER=atlas-db-1 PGDATABASE=varde bash "$KIT/restore.sh" "$@" > "$T/restore" 2>&1; }
if restore "$N" "$T/k1" "$T/remote/ledger"; then ok "restore.sh into a bootstrapped database"; else bad "restore.sh: $(cat "$T/restore")"; fi
grep -q 'requests +1, tombstones +0, participant tombstones +1' "$T/restore" && ok "restore.sh merges the ledger" || bad "restore merge: $(cat "$T/restore")"
[ "$(NEW -d varde -c "SELECT tableowner FROM pg_tables WHERE tablename = 'response'")" = varde_app ] \
  && [ "$(NEW -d varde -c "SELECT tableowner FROM pg_tables WHERE tablename = 'connection_log'")" = varde_audit_owner ] \
  && ok "owners as on the source" || bad "owners: $(NEW -d varde -c "SELECT tablename, tableowner FROM pg_tables WHERE schemaname <> 'pg_catalog'")"
[ "$(NEW -d varde -c "SELECT evtenabled::text || evtowner::regrole::text FROM pg_event_trigger WHERE evtname = 'varde_login'")" = Oatlas ] && grep -q 'created role atlas' "$T/restore" && ok "login event trigger restored, its owner created" || bad "event trigger: $(cat "$T/restore")"
[ "$(PGPASSWORD=b1 psql -X -At -h /tmp -p 5433 -U varde_backup -d varde -c 'SELECT count(*) FROM response')" = 57 ] && ok "varde_backup reads the restored data" || bad "varde_backup cannot read"
mkdir -p "$T/badledger" && age -d -i "$T/k1" "$(find "$T/remote/ledger" -name '*.tar.age' | sort | tail -1)" | tar -C "$T/badledger" -xf -
sed -i '1s/contact_id,registrations/registrations,contact_id/' "$T/badledger/participant_tombstone.csv"
env PATH="$T/dbin:$PATH" VARDE_RESTORE_CONTAINER=atlas-db-1 bash "$KIT/ledger-merge.sh" "$T/badledger" > "$T/merge" 2>&1 && bad "reordered ledger columns passed" || { grep -qi 'column name mismatch' "$T/merge" && ok "ledger with other columns refused" || bad "bad ledger: $(cat "$T/merge")"; }
restore "$N" "$T/k1" && bad "restore over data passed" || { grep -q 'already has' "$T/restore" && ok "restore refuses a database with data" || bad "over data: $(cat "$T/restore")"; }

# Must fail: a key that is not a recipient; a changed count in meta.json; a dump that is not the one in meta.
check "$N" "$T/other" && bad "a foreign key passed" || { grep -q 'does not open canary' "$T/check" && ok "foreign key refused" || bad "foreign key refused: $(cat "$T/check")"; }
cp -r "$N" "$T/tampered" && jq '.counts."public.response" = 58' "$N/meta.json" > "$T/tampered/meta.json"
check "$T/tampered" "$T/k1" && bad "changed count passed" || { grep -q 'public.response: copy 58, restored 57' "$T/check" && ok "changed count refused" || bad "changed count refused: $(cat "$T/check")"; }
jq '.dump_sha256 = "00"' "$N/meta.json" > "$T/tampered/meta.json"
check "$T/tampered" "$T/k1" && bad "wrong sha passed" || { grep -q 'sha256 differs' "$T/check" && ok "wrong sha refused" || bad "wrong sha refused: $(cat "$T/check")"; }

# Must fail before anything is uploaded: two keys only; a table varde_backup cannot read. Both ping /fail.
before="$(find "$T/remote/nightly" -type f | wc -l)"
head -3 "$T/recipients.txt" > "$T/two.txt"
: > "$T/pings"
run_backup env VARDE_BACKUP_RECIPIENTS="$T/two.txt" bash "$KIT/backup.sh" nightly && bad "two recipients passed" || { grep -q 'has 2 age keys, 3 needed' "$T/out" && ok "two recipients refused" || bad "two recipients refused: $(cat "$T/out")"; }
grep -q ' https://hb.example/n/fail$' "$T/pings" && ok "failure pinged /fail" || bad "no /fail ping: $(cat "$T/pings")"
SU -d varde -c "CREATE TABLE secret (x int)"
run_backup bash "$KIT/backup.sh" nightly && bad "unreadable table passed" || { grep -q 'permission denied' "$T/out" && ok "unreadable table stops the backup" || bad "unreadable table stops the backup: $(cat "$T/out")"; }
[ "$(find "$T/remote/nightly" -type f | wc -l)" = "$before" ] && ok "failed runs uploaded nothing" || bad "failed run uploaded files"

echo "roundtrip: $FAILS failed"
[ "$FAILS" -eq 0 ]
