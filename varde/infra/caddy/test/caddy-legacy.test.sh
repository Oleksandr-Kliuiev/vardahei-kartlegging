#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
run_caddy() {
 if command -v caddy >/dev/null; then caddy "$@";
 else docker run --rm -v "$work:/check:ro" caddy:2.10.2-alpine caddy "$@"; fi
}
for block in legacy old; do
 { printf '{\n admin off\n auto_https off\n}\n'; cat "infra/caddy/kartlegging-$block.caddy"; } > "$work/$block.caddy"
 if command -v caddy >/dev/null; then path="$work/$block.caddy"; else path="/check/$block.caddy"; fi
 run_caddy validate --config "$path" --adapter caddyfile
 run_caddy adapt --config "$path" --adapter caddyfile > "$work/$block.json"
done
node infra/caddy/test/verify-legacy.mjs "$work/legacy.json"
printf 'caddy legacy: ok\n'
