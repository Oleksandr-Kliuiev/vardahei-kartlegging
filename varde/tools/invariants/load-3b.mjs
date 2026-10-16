#!/usr/bin/env node
// Load test of the seminar live poll (3.7, revised by the decision of 13.10: no peak load; a real
// seminar is a few dozen people). N phones behind one NAT (one IP for all) answer the open
// question within S seconds against a local server, while each also asks for the state every
// 2.5 s as the phone page does, and the big screen keeps its SSE stream open. Goal: p95 of the
// answers < 1 s and not one 429 within the quotas of config/quotas.json; afterwards the shown
// result counts every answer. No outside service; the server is the built API (load-3b-server.cjs).
//
//   DATABASE_URL=… node tools/invariants/load-3b.mjs [--phones 60] [--seconds 30] [--port 3197] [--out file.json]
//
// Not in CI: run by hand, or `bash tools/invariants/run-3b.sh --load`.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PHONES = Number(arg('phones', '60'));
const SECONDS = Number(arg('seconds', '30'));
const PORT = Number(arg('port', '3197'));
const OUT = arg('out', '');
const NAT = '203.0.113.50'; // one public address for the whole hall (TEST-NET-3)
const POLL_MS = 2500;

if (!Number.isInteger(PHONES) || PHONES < 1 || !(SECONDS > 0) || !Number.isInteger(PORT)) {
  console.error('usage: load-3b.mjs [--phones 60] [--seconds 30] [--port 3197] [--out file.json]');
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required (a disposable database, migrated).');
  process.exit(2);
}

function start() {
  const child = spawn(process.execPath, [resolve(HERE, 'load-3b-server.cjs')], {
    env: { ...process.env, PORT: String(PORT), PUBLIC_URL: `http://127.0.0.1:${PORT}` },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((ready, fail) => {
    let buffer = '';
    const timer = setTimeout(() => fail(new Error('server did not start in 60 s')), 60_000);
    child.stdout.on('data', (chunk) => {
      buffer += String(chunk);
      for (const line of buffer.split('\n')) {
        if (!line.includes('"ready":true')) continue;
        clearTimeout(timer);
        ready({ child, ...JSON.parse(line) });
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      fail(new Error(`server exited with ${code}`));
    });
  });
}

const quantile = (values, q) => {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
};
const summary = (values) => ({
  n: values.length,
  p50: Math.round(quantile(values, 0.5)),
  p95: Math.round(quantile(values, 0.95)),
  p99: Math.round(quantile(values, 0.99)),
  max: Math.round(Math.max(...values)),
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { child, code, key } = await start();
const base = `http://127.0.0.1:${PORT}`;
const phone = { authorization: `Bearer ${code}`, 'x-forwarded-for': NAT };
const presenter = { authorization: `Bearer ${key}` };
let exit = 1;
try {
  // The big screen: its stream stays open and receives a snapshot for every answer.
  const screen = new AbortController();
  let snapshots = 0;
  const stream = fetch(`${base}/api/presenter/stream`, {
    headers: presenter,
    signal: screen.signal,
  })
    .then(async (res) => {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        snapshots += (new TextDecoder().decode(value).match(/event: snapshot/g) ?? []).length;
      }
    })
    .catch(() => undefined);
  const open = await fetch(`${base}/api/presenter/questions/L1/open`, {
    method: 'POST',
    headers: presenter,
  });
  if (open.status !== 200) throw new Error(`open: ${open.status}`);

  const answers = [],
    polls = [],
    statuses = {};
  const count = (s) => (statuses[s] = (statuses[s] ?? 0) + 1);
  const options = ['kontor', 'sal', 'drift'];
  const started = performance.now();
  await Promise.all(
    Array.from({ length: PHONES }, async (_, i) => {
      const at = Math.random() * SECONDS * 1000;
      let answered = false;
      // Polling as the page does, from a random phase, until the phone has answered.
      const polling = (async () => {
        await sleep(Math.random() * POLL_MS);
        while (!answered) {
          const t = performance.now();
          const res = await fetch(`${base}/api/runner/live`, { headers: phone });
          await res.arrayBuffer();
          polls.push(performance.now() - t);
          if (res.status !== 200) count(`poll ${res.status}`);
          await sleep(POLL_MS);
        }
      })();
      await sleep(at);
      const body = JSON.stringify({
        submission_id: randomUUID(),
        part: 'common',
        lang: 'nn',
        answers: { L1: options[i % options.length] },
      });
      const t = performance.now();
      const res = await fetch(`${base}/api/runner/submissions`, {
        method: 'POST',
        headers: { ...phone, 'content-type': 'application/json' },
        body,
      });
      await res.arrayBuffer();
      answers.push(performance.now() - t);
      count(`answer ${res.status}`);
      answered = true;
      await polling;
    }),
  );
  const wall = (performance.now() - started) / 1000;
  await fetch(`${base}/api/presenter/questions/L1/close`, { method: 'POST', headers: presenter });
  const shown = await (
    await fetch(`${base}/api/presenter/questions/L1/release`, {
      method: 'POST',
      headers: presenter,
    })
  ).json();
  await sleep(500);
  screen.abort();
  await stream;
  const result = {
    at: new Date().toISOString(),
    phones: PHONES,
    seconds: SECONDS,
    one_ip: NAT,
    wall_s: Math.round(wall * 10) / 10,
    answers_ms: summary(answers),
    polls_ms: summary(polls),
    statuses,
    shown_n: shown.current?.result?.n ?? null,
    screen_snapshots: snapshots,
    node: process.version,
  };
  const ok =
    result.answers_ms.p95 < 1000 &&
    !Object.keys(statuses).some((s) => s.endsWith(' 429')) &&
    statuses['answer 201'] === PHONES &&
    result.shown_n === PHONES;
  result.ok = ok;
  console.log(JSON.stringify(result, null, 2));
  if (OUT) writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
  exit = ok ? 0 : 1;
} catch (error) {
  console.error(error);
} finally {
  const exited = new Promise((done) => child.once('exit', done));
  child.kill('SIGTERM');
  await exited;
}
process.exit(exit);
