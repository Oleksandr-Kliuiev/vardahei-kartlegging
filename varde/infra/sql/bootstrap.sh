#!/usr/bin/env bash
# Bootstrap of the Varde database on the shared Postgres (task 0.5b). Run by the hosting
# operator on the VPS as root: bash /opt/varde/sql/bootstrap.sh
#   1. preflight: Varde roles must not exist yet (exit 2: run varde-teardown.sql first)
#   2. generates role passwords (and SESSION_SECRET once) in memory only
#   3. varde-roles.sql (database postgres) and varde-db.sql (database varde) via psql on stdin
#   4. only after both succeed: writes DATABASE_URL, SESSION_SECRET to app.env and the PG*
#      keys to backup.env (0600); other keys of both files are kept
# Prints only "bootstrap ok" or the name of the failed step. Passwords never reach argv,
# stdout, shell history or logs (printf is a builtin; psql output is discarded).
#
# Environment (defaults are the production values; the test overrides them):
#   VARDE_PSQL_CMD     superuser psql prefix; "-d <db>" is appended. Default: unix socket inside
#                      atlas-db-1 (docker exec … psql -U "$POSTGRES_USER", no -h)
#   VARDE_CONFIG_DIR   directory with db-budget.json (/opt/varde/config)
#   VARDE_APP_ENV      /etc/varde/app.env       VARDE_BACKUP_ENV  /etc/varde/backup.env
#   VARDE_DB_HOST      host in the URLs (atlas-db-1)   VARDE_DB_PORT  5432
#   VARDE_DBNAME       varde
set -euo pipefail
umask 077

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
config_dir=${VARDE_CONFIG_DIR:-/opt/varde/config}
app_env=${VARDE_APP_ENV:-/etc/varde/app.env}
backup_env=${VARDE_BACKUP_ENV:-/etc/varde/backup.env}
db_host=${VARDE_DB_HOST:-atlas-db-1}
db_port=${VARDE_DB_PORT:-5432}
dbname=${VARDE_DBNAME:-varde}

step=start
trap 'echo "bootstrap failed: $step" >&2' ERR

psql_su() {
  local db=$1
  if [[ -n "${VARDE_PSQL_CMD:-}" ]]; then
    eval "$VARDE_PSQL_CMD" -d '"$db"'
  else
    # Local socket in the container; if `local` in pg_hba is not trust, add
    # PGPASSWORD="$POSTGRES_PASSWORD" inside the same sh -c (the value is never printed).
    docker exec -i atlas-db-1 sh -c 'exec psql -X -q -U "$POSTGRES_USER" -v ON_ERROR_STOP=1 -d "$1"' psql "$db"
  fi
}

# Rewrites one KEY=value in an env file (created 0600 if missing); other lines are kept.
set_key() {
  local file=$1 key=$2 value=$3 tmp
  tmp=$(mktemp "${file}.XXXXXX")
  if [[ -f "$file" ]]; then grep -v "^${key}=" "$file" > "$tmp" || true; fi
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  [[ -f "$file" ]] || : > "$file"
  chmod 600 "$file"
  cat "$tmp" > "$file"
  rm -f "$tmp"
}

step=preflight
existing=$(printf '\\t on\n\\a\nselect rolname from pg_roles where rolname in (%s);\n' \
  "'varde_app','varde_backup'" | psql_su postgres 2>/dev/null)
if [[ -n "$existing" ]]; then
  echo "bootstrap stopped: Varde roles already exist; run varde-teardown.sql first" >&2
  exit 2
fi

step=role_limit
role_limit=$(docker run --rm -q -v "$config_dir:/c:ro" node:22-alpine \
  node -p 'require("/c/db-budget.json").role_connection_limit')
[[ "$role_limit" =~ ^[0-9]+$ ]]

step=generate
app_pw=$(openssl rand -hex 32)
backup_pw=$(openssl rand -hex 32)
session_secret=''
if ! { [[ -f "$app_env" ]] && grep -q '^SESSION_SECRET=.' "$app_env"; }; then
  session_secret=$(openssl rand -hex 48)
fi

step=varde-roles.sql
{
  printf '\\set app_pw %s\n\\set backup_pw %s\n' "$app_pw" "$backup_pw"
  printf '\\set role_limit %s\n\\set dbname %s\n' "$role_limit" "$dbname"
  cat "$here/varde-roles.sql"
} | psql_su postgres > /dev/null 2>&1

step=varde-db.sql
psql_su "$dbname" < "$here/varde-db.sql" > /dev/null 2>&1

step=app.env
set_key "$app_env" DATABASE_URL "postgresql://varde_app:${app_pw}@${db_host}:${db_port}/${dbname}"
if [[ -n "$session_secret" ]]; then set_key "$app_env" SESSION_SECRET "$session_secret"; fi

step=backup.env
set_key "$backup_env" PGHOST "$db_host"
# PGPORT only off the default port (the test server); production keeps four keys.
if [[ "$db_port" != 5432 ]]; then set_key "$backup_env" PGPORT "$db_port"; fi
set_key "$backup_env" PGUSER varde_backup
set_key "$backup_env" PGPASSWORD "$backup_pw"
set_key "$backup_env" PGDATABASE "$dbname"

echo "bootstrap ok"
