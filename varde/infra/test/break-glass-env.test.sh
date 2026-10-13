#!/usr/bin/env bash
# Break-glass hash through Compose (task 0.8): the stdout line of `cli.js break-glass-hash`
# (single quotes) survives both Compose parsers byte for byte — `--env-file` interpolation and
# `env_file:` — and argon2 verify with the stderr password passes; the same line without quotes
# is mangled by interpolation and the app rejects it (bad_hash).
#   bash infra/test/break-glass-env.test.sh                    # local: apps/api/dist (pnpm build)
#   VARDE_IMAGE=varde-api:ci bash infra/test/break-glass-env.test.sh   # CI: inside the image
set -euo pipefail
varde=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail() { echo "break-glass env test FAILED: $*" >&2; exit 1; }

# node in the image (/out) or in apps/api; extra -e NAME are passed through.
run_node() {
  if [[ -n "${VARDE_IMAGE:-}" ]]; then
    docker run --rm -i -e VARDE_BREAK_GLASS_PASSWORD_HASH -e PW "$VARDE_IMAGE" node "$@"
  else
    (cd "$varde/apps/api" && node "$@")
  fi
}

run_node dist/cli.js break-glass-hash > "$tmp/line" 2> "$tmp/stderr"
grep -Eq "^VARDE_BREAK_GLASS_PASSWORD_HASH='\\\$argon2id\\\$[^']+'\$" "$tmp/line" || fail "stdout is not the quoted hash line"
[[ $(wc -l < "$tmp/line") -eq 1 ]] || fail "stdout must be one line"
pw=$(sed -n 's/^break-glass password (shown once): //p' "$tmp/stderr")
[[ ${#pw} -ge 22 ]] || fail "password shorter than 128 bits"
grep -qF "$pw" "$tmp/line" && fail "password leaked to stdout"
hash=$(sed -n "s/^VARDE_BREAK_GLASS_PASSWORD_HASH='\\(.*\\)'\$/\\1/p" "$tmp/line")

cat > "$tmp/compose.yml" <<'YAML'
services:
  x:
    image: busybox:1.37.0
    env_file: [{ path: ./app.env }]
    environment:
      INTERP: "${VARDE_BREAK_GLASS_PASSWORD_HASH}"
YAML
# `config` escapes $ as $$ in its output; undo that to compare the real value.
compose_values() {
  docker compose -f "$tmp/compose.yml" --env-file "$tmp/app.env" config --format json 2>/dev/null |
    node -e 'const e = JSON.parse(require("fs").readFileSync(0, "utf8")).services.x.environment;
      for (const k of ["VARDE_BREAK_GLASS_PASSWORD_HASH", "INTERP"]) console.log(String(e[k]).replaceAll("$$", "$"));'
}

cp "$tmp/line" "$tmp/app.env"
{ read -r from_file; read -r interp; } < <(compose_values)
[[ "$from_file" == "$hash" ]] || fail "env_file changed the quoted hash"
[[ "$interp" == "$hash" ]] || fail "--env-file interpolation changed the quoted hash"
VARDE_BREAK_GLASS_PASSWORD_HASH="$from_file" PW="$pw" run_node -e '
  require("@node-rs/argon2").verify(process.env.VARDE_BREAK_GLASS_PASSWORD_HASH, process.env.PW)
    .then((ok) => process.exit(ok ? 0 : 1), () => process.exit(1));' || fail "argon2 verify failed"

sed "s/'//g" "$tmp/line" > "$tmp/app.env"
{ read -r from_file; read -r interp; } < <(compose_values)
[[ "$from_file" != "$hash" && "$interp" != "$hash" ]] || fail "expected the unquoted hash to be mangled"
VARDE_BREAK_GLASS_PASSWORD_HASH="$from_file" PW='' run_node -e '
  process.env.VARDE_BREAK_GLASS_UNTIL = new Date(Date.now() + 60000).toISOString();
  const c = require("./dist/config/break-glass-config.js").readBreakGlassConfig(process.env);
  process.exit(c.state === "rejected" && c.details.reason === "bad_hash" ? 0 : 1);' || fail "mangled hash was not rejected"
echo "env ok"
