// k6 stand of 0.12 (ADR-016): POST /stub/submit through the public host.
//   campaign — 100 VU, one POST + sleep 20–60 s per iteration (≈ 2–5 submissions/s), 10 min
//   seminar  — then 100 submissions within 10 s
// Thresholds per phase: p(95) < 1000 ms and no failed requests.
// Env: BASE_URL (https://<host>), STUB_TOKEN (≤ 4 h token of the stand window).
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL;
const TOKEN = __ENV.STUB_TOKEN;
const CAMPAIGN = __ENV.CAMPAIGN_DURATION || '10m';

export const options = {
  scenarios: {
    campaign: { executor: 'constant-vus', vus: 100, duration: CAMPAIGN, exec: 'campaign' },
    seminar: {
      executor: 'shared-iterations',
      vus: 100,
      iterations: 100,
      maxDuration: '10s',
      startTime: CAMPAIGN,
      exec: 'seminar',
    },
  },
  thresholds: {
    'http_req_duration{scenario:campaign}': ['p(95)<1000'],
    'http_req_duration{scenario:seminar}': ['p(95)<1000'],
    'http_req_failed{scenario:campaign}': ['rate==0'],
    'http_req_failed{scenario:seminar}': ['rate==0'],
  },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};

function uuid() {
  const h = [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16));
  h[12] = '4';
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/** ≈ 40 answers like a real survey (scale 1–5 and a few short texts). */
function answers() {
  const a = {};
  for (let i = 1; i <= 36; i += 1) a[`F${i}`] = 1 + Math.floor(Math.random() * 5);
  for (let i = 1; i <= 4; i += 1) a[`T${i}`] = 'kort svar';
  return a;
}

function submit() {
  const res = http.post(
    `${BASE_URL}/stub/submit`,
    JSON.stringify({ submission_id: uuid(), answers: answers() }),
    { headers: { 'content-type': 'application/json', 'x-varde-stub-token': TOKEN } },
  );
  check(res, { 'status 201': (r) => r.status === 201 });
}

export function campaign() {
  submit();
  sleep(20 + Math.random() * 40);
}

export function seminar() {
  submit();
}
