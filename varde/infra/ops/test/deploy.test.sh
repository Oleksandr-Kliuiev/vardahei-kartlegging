#!/usr/bin/env bash
# Tests of deploy.sh / rollback.sh without a VPS: `ssh` is a stub that runs the remote command string
# locally in bash (so `set -euo pipefail` and pipes behave as on the VPS), against a temp REMOTE_DIR,
# with stub `docker`, `rsync` and `curl`. The test that matters: a failing migration stops the deploy
# and leaves .env/VERSION of the running version untouched.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OPS="$(cd "$HERE/.." && pwd)"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
FAILS=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; FAILS=$((FAILS + 1)); }

mkdir -p "$T/bin" "$T/repo/varde/infra" "$T/repo/varde/config" "$T/repo/varde/tools/metrics" "$T/repo/varde/apps/api/prisma/migrations/20260101000000_x"
echo 'down;' > "$T/repo/varde/apps/api/prisma/migrations/20260101000000_x/down.sql"
git -C "$T/repo" init -q && git -C "$T/repo" -c user.email=t@t -c user.name=t add -A >/dev/null
git -C "$T/repo" -c user.email=t@t -c user.name=t commit -q -m init --allow-empty
SHA="$(git -C "$T/repo" rev-parse --short=12 HEAD)"

cat > "$T/bin/ssh" <<'STUB'
#!/usr/bin/env bash
# ssh -T host <command words...>: run the command string locally, like the remote login shell would
shift 2
if [ "$#" -ge 2 ] && [ "$1" = bash ] && [ "$2" = -s ]; then exec bash -s; fi
exec bash -c "$*"
STUB
cat > "$T/bin/docker" <<'STUB'
#!/usr/bin/env bash
echo "docker $*" >> "$STUB_LOG"
case "$*" in
  *"migrate deploy"*) echo "Applying migration x"; [ "${STUB_MIGRATE_FAIL:-0}" = 1 ] && { echo "Error: P3009 migrate found failed migrations" >&2; exit 7; }; echo "All migrations have been successfully applied." ;;
  *"ps --format"*) echo "${STUB_PS:-Up 5 seconds (healthy)}" ;;
  "exec atlas-db-1 sh -c pg_dump"*) echo "PGDMP" ;;
  "exec atlas-db-1"*) echo 3 ;;
esac
STUB
cat > "$T/bin/rsync" <<'STUB'
#!/usr/bin/env bash
echo "rsync $*" >> "$STUB_LOG"
STUB
cat > "$T/bin/curl" <<'STUB'
#!/usr/bin/env bash
echo "{\"status\":\"ok\",\"db\":\"ok\",\"version\":\"${STUB_VERSION:?}\"}"
STUB
command -v sha256sum >/dev/null 2>&1 || printf '#!/usr/bin/env bash\nshasum -a 256 "$@"\n' > "$T/bin/sha256sum"
chmod +x "$T/bin/"*

new_remote() {
  rm -rf "$T/opt" "$T/backups"
  mkdir -p "$T/opt" "$T/backups"
  echo prev1234abcd > "$T/opt/VERSION"
  echo 'VARDE_SHA=prev1234abcd' > "$T/opt/.env"
  : > "$T/log"
}
run_deploy() {
  env PATH="$T/bin:$PATH" STUB_LOG="$T/log" STUB_VERSION="$SHA" VARDE_ROOT="$T/repo/varde" VARDE_REMOTE_DIR="$T/opt" \
    BACKUP_ROOT="$T/backups" VARDE_WAIT_TRIES=2 VARDE_WAIT_SLEEP=0 "$@" bash "$OPS/deploy.sh" "${DEPLOY_SHA:-$SHA}" > "$T/out" 2>&1
}

# 1. green path: migration before the switch, new version written, health checked
new_remote
if run_deploy && grep -q "VARDE_SHA=$SHA" "$T/opt/.env" && [ "$(cat "$T/opt/VERSION")" = "$SHA" ]; then ok "deploy writes the new version"; else bad "green deploy"; cat "$T/out"; fi
m=$(grep -n 'migrate deploy' "$T/log" | head -1 | cut -d: -f1); u=$(grep -n 'up -d' "$T/log" | head -1 | cut -d: -f1)
if [ -n "$m" ] && [ -n "$u" ] && [ "$m" -lt "$u" ]; then ok "migrate runs before up -d"; else bad "order migrate/up"; fi
if grep -q -- "--exclude ops/" "$T/log"; then ok "ops/ is not copied to the VPS"; else bad "rsync excludes ops/"; fi
if ls "$T/backups"/deploy-*/varde-pre.dump >/dev/null 2>&1; then ok "backup made before the deploy"; else bad "backup"; fi

# 2. the old bug: the migration fails -> deploy stops, nothing is switched
new_remote
if run_deploy STUB_MIGRATE_FAIL=1; then bad "failed migration must fail the deploy"; else ok "failed migration fails the deploy"; fi
if [ "$(cat "$T/opt/VERSION")" = prev1234abcd ] && grep -q prev1234abcd "$T/opt/.env"; then ok "VERSION and .env unchanged after a failed migration"; else bad "VERSION/.env changed"; fi
if grep -q 'up -d' "$T/log"; then bad "up -d ran after a failed migration"; else ok "no up -d after a failed migration"; fi

# 3. never healthy -> non-zero
new_remote
if run_deploy STUB_PS="Up 2 seconds (health: starting)"; then bad "unhealthy app must fail the deploy"; else ok "unhealthy app fails the deploy"; fi

# 4. /health reports another version -> non-zero
new_remote
if run_deploy STUB_VERSION=other0000000; then bad "wrong version in /health must fail"; else ok "wrong /health version fails the deploy"; fi

# 5. guards: wrong sha, dirty tree
new_remote
if DEPLOY_SHA=000000000000 run_deploy; then bad "wrong sha accepted"; else ok "HEAD must equal the given sha"; fi
touch "$T/repo/varde/dirty.txt"
if run_deploy; then bad "dirty tree accepted"; else ok "dirty working tree is refused"; fi
rm "$T/repo/varde/dirty.txt"

# 6. rollback needs the down.sql and fails closed
new_remote
if env PATH="$T/bin:$PATH" STUB_LOG="$T/log" STUB_VERSION=prev1234abcd VARDE_ROOT="$T/repo/varde" VARDE_REMOTE_DIR="$T/opt" VARDE_WAIT_TRIES=2 VARDE_WAIT_SLEEP=0 bash "$OPS/rollback.sh" prev1234abcd no_such_migration >/dev/null 2>&1; then bad "rollback without down.sql"; else ok "rollback refuses a migration without down.sql"; fi

if [ "$FAILS" -eq 0 ]; then echo "all ok"; else echo "$FAILS failed"; exit 1; fi
