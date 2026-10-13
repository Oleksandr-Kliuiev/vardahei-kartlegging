#!/usr/bin/env bash
# k6 scripts of 0.12 parse and declare the expected scenarios and thresholds (no load).
set -euo pipefail
dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
image=grafana/k6:1.3.0
inspect() { docker run --rm -v "$dir:/s:ro" $image inspect "${@:2}" "/s/$1"; }
inspect stub-submit.js -e BASE_URL=https://x.test -e STUB_TOKEN=t | node -e '
const o = JSON.parse(require("fs").readFileSync(0, "utf8"));
const s = o.scenarios, t = o.thresholds, ok = (c, m) => { if (!c) { console.error("k6 test FAILED: stub-submit.js " + m); process.exit(1); } };
ok(s.campaign.vus === 100 && s.campaign.duration === "10m0s", "campaign: 100 VU, 10 min");
ok(s.seminar.iterations === 100 && s.seminar.maxDuration === "10s" && s.seminar.startTime === "10m0s", "seminar: 100 in 10 s after the campaign");
for (const p of ["campaign", "seminar"]) {
  ok(JSON.stringify(t[`http_req_duration{scenario:${p}}`]) === JSON.stringify(["p(95)<1000"]), p + " p95");
  ok(JSON.stringify(t[`http_req_failed{scenario:${p}}`]) === JSON.stringify(["rate==0"]), p + " failed");
}'
inspect atlas-baseline.js -e ATLAS_URL=https://x.test -e BASELINE_P95_MS=200 | node -e '
const t = JSON.parse(require("fs").readFileSync(0, "utf8")).thresholds;
if (JSON.stringify(t.http_req_duration) !== JSON.stringify(["p(95)<=400"]) || !t.atlas_5xx) {
  console.error("k6 test FAILED: atlas-baseline.js thresholds"); process.exit(1);
}'
echo "k6 ok"
