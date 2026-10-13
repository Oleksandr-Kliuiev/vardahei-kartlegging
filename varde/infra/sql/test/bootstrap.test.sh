#!/usr/bin/env bash
# Test of bootstrap.sh (task 0.5b, job integration). Needs Docker and DATABASE_URL of a
# superuser (CI service Postgres or infra/compose.dev.yml). psql runs from the pinned server
# image with host networking; env files go to a temporary directory.
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
sql=$(cd "$here/.." && pwd)
varde=$(cd "$sql/../.." && pwd)
: "${DATABASE_URL:?DATABASE_URL of a superuser is required}"
image=postgres:17.6-bookworm
dbname=varde_bt

# Superuser connection parts from DATABASE_URL (node parses the URL, nothing is printed).
eval "$(node -e '
const u = new URL(process.env.DATABASE_URL);
const q = (s) => "\x27" + s.replace(/\x27/g, "\x27\\\x27\x27") + "\x27";
console.log(`export PGHOST=${q(u.hostname)} PGPORT=${q(u.port || "5432")}`);
console.log(`export PGUSER=${q(decodeURIComponent(u.username))} PGPASSWORD=${q(decodeURIComponent(u.password))}`);
')"
psql_cmd="docker run --rm -i --network host -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD $image psql -X -q -v ON_ERROR_STOP=1"
su() { $psql_cmd -d "$1"; }

tmp=$(mktemp -d)
cleanup() {
  printf 'DROP DATABASE IF EXISTS %s WITH (FORCE);\nDROP ROLE IF EXISTS varde_app, varde_backup, varde_audit_owner;\n' \
    "$dbname" | su postgres > /dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
fail() { echo "bootstrap test FAILED: $*" >&2; exit 1; }
mode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }
keys() { cut -d= -f1 "$1" | sort | tr '\n' ' '; }

run_bootstrap() {
  VARDE_PSQL_CMD="$psql_cmd" VARDE_CONFIG_DIR="$varde/config" \
    VARDE_APP_ENV="$tmp/app.env" VARDE_BACKUP_ENV="$tmp/backup.env" \
    VARDE_DB_HOST="$PGHOST" VARDE_DB_PORT="$PGPORT" VARDE_DBNAME="$dbname" \
    bash "$sql/bootstrap.sh"
}

cleanup_db_only() {
  printf 'DROP DATABASE IF EXISTS %s WITH (FORCE);\nDROP ROLE IF EXISTS varde_app, varde_backup, varde_audit_owner;\n' \
    "$dbname" | su postgres > /dev/null 2>&1
}
cleanup_db_only

# 1. Preflight: an existing Varde role stops the run before anything is written.
echo 'CREATE ROLE varde_app;' | su postgres > /dev/null
set +e
out=$(run_bootstrap 2>&1)
code=$?
set -e
[[ $code -eq 2 ]] || fail "preflight exit $code, expected 2: $out"
[[ "$out" == *"run varde-teardown.sql first"* ]] || fail "preflight text: $out"
[[ ! -e "$tmp/app.env" && ! -e "$tmp/backup.env" ]] || fail "preflight wrote env files"
echo 'DROP ROLE varde_app;' | su postgres > /dev/null
echo "preflight ok"

# 2. Clean run: only "bootstrap ok", 0600 files with exactly the expected keys.
printf 'PUBLIC_URL=\n' > "$tmp/app.env"
out=$(run_bootstrap 2>&1) || fail "bootstrap failed: $out"
[[ "$out" == "bootstrap ok" ]] || fail "unexpected output: $out"
for f in app.env backup.env; do [[ $(mode "$tmp/$f") == 600 ]] || fail "$f mode $(mode "$tmp/$f")"; done
[[ $(keys "$tmp/app.env") == "DATABASE_URL PUBLIC_URL SESSION_SECRET " ]] || fail "app.env keys: $(keys "$tmp/app.env")"
expected="PGDATABASE PGHOST PGPASSWORD PGUSER "
[[ "$PGPORT" == 5432 ]] || expected="PGDATABASE PGHOST PGPASSWORD PGPORT PGUSER "
[[ $(keys "$tmp/backup.env") == "$expected" ]] || fail "backup.env keys: $(keys "$tmp/backup.env")"
grep -Eq '^DATABASE_URL=postgresql://varde_app:[0-9a-f]{64}@[^/]+/varde_bt$' "$tmp/app.env" || fail "DATABASE_URL format"
grep -Eq '^SESSION_SECRET=[0-9a-f]{96}$' "$tmp/app.env" || fail "SESSION_SECRET format"
grep -Eq '^PGPASSWORD=[0-9a-f]{64}$' "$tmp/backup.env" || fail "PGPASSWORD format"
echo "env files ok"

# 3. The URL from the file connects as varde_app; backup.env connects as varde_backup.
url=$(grep '^DATABASE_URL=' "$tmp/app.env" | cut -d= -f2-)
who=$(printf '%s' "$url" | docker run --rm -i --network host $image \
  sh -c 'read -r u; psql -X -tAc "select current_user" "$u"')
[[ "$who" == varde_app ]] || fail "DATABASE_URL connected as '$who'"
who=$(docker run --rm --network host --env-file "$tmp/backup.env" $image psql -X -tAc 'select current_user')
[[ "$who" == varde_backup ]] || fail "backup.env connected as '$who'"
echo "connections ok"

# 4. Teardown script removes everything.
printf '\\set dbname %s\n' "$dbname" | cat - "$sql/varde-teardown.sql" | su postgres > /dev/null
left=$(printf '\\t on\n\\a\nselect count(*) from pg_roles where rolname like %s;\n' "'varde\_%'" | su postgres)
[[ "$left" == 0 ]] || fail "roles left after teardown: $left"
echo "bootstrap test ok"
