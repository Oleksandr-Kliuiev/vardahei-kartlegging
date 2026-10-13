// k6 baseline of Atlas for 0.12 (ADR-016): a public GET of Atlas without side effects, chosen
// by the hosting operator (recorded in the 0.12 report). Low rate, same duration as the stand.
//   1st run (quiet hour, no stand): baseline p95 → BASELINE_P95_MS in the report
//   2nd run (during the stand) with BASELINE_P95_MS: thresholds p(95) ≤ 2 × baseline, 5xx = 0
// Env: ATLAS_URL, BASELINE_P95_MS (optional), DURATION (default 10m10s).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const serverErrors = new Rate('atlas_5xx');
const baseline = Number(__ENV.BASELINE_P95_MS || 0);

export const options = {
  scenarios: {
    atlas: { executor: 'constant-vus', vus: 1, duration: __ENV.DURATION || '10m10s' },
  },
  thresholds: Object.assign(
    { atlas_5xx: ['rate==0'] },
    baseline > 0 ? { http_req_duration: [`p(95)<=${2 * baseline}`] } : {},
  ),
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  const res = http.get(__ENV.ATLAS_URL);
  serverErrors.add(res.status >= 500);
  check(res, { 'status < 500': (r) => r.status < 500 });
  sleep(5);
}
