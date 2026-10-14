#!/usr/bin/env node
// Three synthetic screenshot pairs. Run against the runner started by e2e global-setup.
//   node tools/parity/screens.mjs [http://127.0.0.1:3098]
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { startOldServer } from './old-server.mjs';
import { FIXTURES } from './generate.mjs';
import { walkFixture } from './runner-paths.mjs';
import { sourcePaths } from './runner-scenarios.mjs';
import setupRunner from '../../apps/runner/e2e/global-setup.mjs';
import { currentBank } from './bank.mjs';

const read = (name) => readFileSync(resolve(FIXTURES, name), 'utf8');
const scenario = sourcePaths().scenarios.find((s) => s.id === 'ki-kontor');
const cleanupRunner = process.argv[2] ? undefined : await setupRunner();
let server;
let browser;
try {
  server = await startOldServer({
    svar: read('svar.synthetic.jsonl'),
    runde1: read('runde1.synthetic.js'),
    tilgang: read('tilgang.json'),
    kundar: read('kundar.json'),
  });
  browser = await chromium.launch();
  const destination = resolve(import.meta.dirname, '../../../docs/varde/evidence/stage-1/1.13e');
  mkdirSync(destination, { recursive: true });
  const options = {
    viewport: { width: 720, height: 1000 },
    reducedMotion: 'reduce',
    colorScheme: 'light',
  };
  const old = await browser.newPage(options),
    runner = await browser.newPage(options);
  const origin = new URL(server.base).origin;
  await old.route('**/*', (route) =>
    route.request().url().startsWith(origin) ? route.continue() : route.abort(),
  );
  await old.route('**/api/svar', (route) => route.fulfill({ status: 200, json: { ok: true } }));
  const state = JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, '../../apps/runner/test-results/rounds.json'),
      'utf8',
    ),
  ).nn;
  const key = `varde:${createHash('sha256').update(state.code).digest('hex').slice(0, 16)}:${state.version}`;
  await runner.route('**/api/runner/submissions', (route) =>
    route.fulfill({
      status: 201,
      json: { ok: true, submission_id: route.request().postDataJSON().submission_id },
    }),
  );
  const base = process.argv[2] ?? process.env.RUNNER_BASE_URL ?? 'http://127.0.0.1:3098';
  const stages = [
    ['question', 0],
    ['middle', Math.floor(scenario.path.length / 2)],
    ['top', scenario.path.length],
  ];
  for (const [label, step] of stages) {
    await old.goto(`${server.base}/?k=daco&s=ki&t=${JSON.parse(read('tilgang.json')).daco}`);
    // The walker captures the actual fixture path; callback stops at the desired frame.
    let captured = false;
    await walkFixture(old, scenario, async (index) => {
      if (index !== step) return false;
      if (label === 'top') await old.waitForSelector('.slutt');
      await old.screenshot({ path: resolve(destination, `${label}-old.png`), fullPage: true });
      captured = true;
      return true;
    });
    if (!captured) {
      await old.waitForSelector('.slutt');
      await old.screenshot({ path: resolve(destination, `${label}-old.png`), fullPage: true });
    }
    await runner.goto(`${base}/r?c=${state.code}`);
    // Both frames show only answers entered before this step, with the same dynamic path.
    const previous = new Set(scenario.path.slice(0, step));
    const answers = Object.fromEntries(
      Object.entries(scenario.answers).filter(([id]) => previous.has(id)),
    );
    for (const q of currentBank().skjema[scenario.survey].sporsmal) {
      if (q.type === 'scale' && q.rader.some((r) => answers[q.id]?.[r.id] == null))
        delete answers[q.id];
    }
    const free = Object.fromEntries(
      Object.entries(scenario.free).filter(([id]) => previous.has(id)),
    );
    await runner.evaluate(
      ({ key, answers, free, step }) =>
        localStorage.setItem(
          key,
          JSON.stringify({
            answers,
            free,
            step,
            lang: 'nn',
            started_at: Date.now(),
            expires: '2099-06-01T22:00:00Z',
            submission_ids: { common: crypto.randomUUID(), leader: crypto.randomUUID() },
          }),
        ),
      { key, answers, free, step },
    );
    await runner.reload();
    if (label === 'top') {
      await runner.locator('#send').click();
      await runner.waitForSelector('.slutt');
    } else await runner.waitForSelector('h2.sp');
    await runner.screenshot({ path: resolve(destination, `${label}-new.png`), fullPage: true });
  }
} finally {
  await browser?.close();
  await server?.stop();
  await cleanupRunner?.();
}
