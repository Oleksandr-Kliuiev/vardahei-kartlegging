#!/usr/bin/env bash
# Error-log filter of Caddy (task 0.6): config validates, and a reverse_proxy error (upstream
# down → 502) is logged without the query string, without secret headers, with a masked IP.
set -euo pipefail
dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
image=caddy:2.10.2-alpine
fail() { echo "caddy test FAILED: $*" >&2; exit 1; }

docker run --rm -v "$dir:/c:ro" $image caddy validate --adapter caddyfile --config /c/test/Caddyfile > /dev/null 2>&1 \
  || fail "validate test/Caddyfile"

cid=$(docker run -d --rm -v "$dir:/c:ro" -p 127.0.0.1::8080 $image \
  caddy run --adapter caddyfile --config /c/test/Caddyfile.local)
trap 'docker rm -f "$cid" > /dev/null 2>&1 || true' EXIT
port=$(docker port "$cid" 8080/tcp | head -1 | sed 's/.*://')
for _ in $(seq 1 50); do
  curl -s -o /dev/null "http://127.0.0.1:$port/" && break
  sleep 0.2
done
code=$(curl -s -o /dev/null -w '%{http_code}' \
  -H 'Cookie: varde_session=TESTCOOKIE' -H 'Authorization: Bearer TESTAUTH' \
  -H 'X-Varde-Stub-Token: TESTTOKEN' -H 'Referer: https://x.test/?c=TESTREFERER' \
  "http://127.0.0.1:$port/r/x?c=TESTQUERY")
[[ "$code" == 502 ]] || fail "expected 502 from a dead upstream, got $code"
sleep 0.5
logs=$(docker logs "$cid" 2>&1)
line=$(printf '%s\n' "$logs" | grep '"uri":"/r/x"' | head -1) || true
[[ -n "$line" ]] || fail "no error line with uri /r/x"
for s in TESTQUERY TESTCOOKIE TESTAUTH TESTTOKEN TESTREFERER; do
  [[ $(printf '%s\n' "$logs" | grep -c "$s" || true) == 0 ]] || fail "$s found in the log"
done
printf '%s' "$line" | grep -Eq '"remote_ip":"[0-9]+\.[0-9]+\.[0-9]+\.0"' || fail "remote_ip not masked: $line"
[[ -n "${CADDY_LOG_SAMPLE:-}" ]] && printf '%s\n' "$line"
echo "caddy log ok"
