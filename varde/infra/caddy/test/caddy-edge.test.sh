#!/usr/bin/env bash
# Edge headers of varde.caddy (improvement plan 0.5): the real site body in front of a stub
# upstream. HTML and JS are compressed, SSE and small bodies are not, HSTS is set without
# includeSubDomains.
set -euo pipefail
dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
image=caddy:2.10.2-alpine
fail() { echo "caddy edge test FAILED: $*" >&2; exit 1; }
tmp=$(mktemp -d)
trap 'docker rm -f "${cid:-}" > /dev/null 2>&1 || true; rm -rf "$tmp"' EXIT

# The site body without its upstream, under a plain-HTTP address.
body=$(sed -n '/^varde\.vardahei\.tech {$/,/^}$/p' "$dir/varde.caddy" | sed '1d;$d' | grep -v reverse_proxy)
[[ -n "$body" ]] || fail "no site block in varde.caddy"
big=$(printf 'x%.0s' $(seq 1 2000))
cat > "$tmp/Caddyfile" <<CF
{
	admin off
	auto_https off
}
:8080 {
$body
	reverse_proxy 127.0.0.1:9001
}
:9001 {
	@html path /html
	header @html Content-Type "text/html; charset=utf-8"
	respond @html "$big"
	@js path /js
	header @js Content-Type "application/javascript"
	respond @js "$big"
	@sse path /sse
	header @sse Content-Type "text/event-stream"
	respond @sse "data: $big"
	@small path /small
	header @small Content-Type "application/json"
	respond @small "{}"
}
CF
docker run --rm -v "$tmp:/c:ro" $image caddy validate --adapter caddyfile --config /c/Caddyfile > /dev/null 2>&1 \
  || fail "validate"
cid=$(docker run -d --rm -v "$tmp:/c:ro" -p 127.0.0.1::8080 $image \
  caddy run --adapter caddyfile --config /c/Caddyfile)
port=$(docker port "$cid" 8080/tcp | head -1 | sed 's/.*://')
for _ in $(seq 1 50); do
  curl -s -o /dev/null "http://127.0.0.1:$port/small" && break
  sleep 0.2
done
enc() { curl -s -o /dev/null -D - -H 'Accept-Encoding: zstd, gzip' "http://127.0.0.1:$port$1" \
  | tr -d '\r' | awk -F': ' 'tolower($1)=="content-encoding"{print $2}'; }
[[ $(enc /html) == zstd ]] || fail "html not zstd: '$(enc /html)'"
[[ $(enc /js) == zstd ]] || fail "js not zstd"
[[ $(curl -s -o /dev/null -D - -H 'Accept-Encoding: gzip' "http://127.0.0.1:$port/js" | tr -d '\r' \
  | awk -F': ' 'tolower($1)=="content-encoding"{print $2}') == gzip ]] || fail "js not gzip"
[[ -z $(enc /sse) ]] || fail "event-stream compressed"
[[ -z $(enc /small) ]] || fail "small body compressed"
hsts=$(curl -s -o /dev/null -D - "http://127.0.0.1:$port/small" | tr -d '\r' \
  | awk -F': ' 'tolower($1)=="strict-transport-security"{print $2}')
[[ "$hsts" == "max-age=31536000" ]] || fail "hsts: '$hsts'"
echo "caddy edge ok"
