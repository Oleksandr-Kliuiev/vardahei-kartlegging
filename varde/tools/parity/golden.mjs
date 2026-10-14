#!/usr/bin/env node
// Golden values of the old dashboard and server on the synthetic fixtures (1.2c, stage-1.md §6
// p. 11). Two runs of the old server: (a) fixtures without edge rows and KI 2026-10-12 rows —
// tryggleik, KI 2026-10-13 and /api/analyse.csv; (b) only the KI 2026-10-12 rows. Every view
// (survey × client filter, role «alle») is scraped section by section: title, tables, text lines.
//   node tools/parity/golden.mjs           write golden/
//   node tools/parity/golden.mjs --check   regenerate into a temporary folder and compare
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { REPO } from './bank.mjs';
import { FIXTURES } from './generate.mjs';
import { browserPaths, pathsJson } from './runner-paths.mjs';
import { kartleggingTree } from './kartlegging-tree.mjs';
import { startOldServer } from './old-server.mjs';

export const GOLDEN = fileURLToPath(new URL('./golden/', import.meta.url));
const FIXTURE_FILES = [
  'svar.synthetic.jsonl',
  'runde1.synthetic.js',
  'tilgang.json',
  'kundar.json',
  'README.md',
];
const { loggInn } = createRequire(import.meta.url)(join(REPO, 'tools/test/stotte.js'));

const fixture = (name) => readFileSync(join(FIXTURES, name), 'utf8');

/** Line numbers (1-based) of edge rows and KI 2026-10-12 rows, from fixtures/README.md. */
export function readmeLines(readme = fixture('README.md')) {
  const edge = [...readme.matchAll(/^- (\d+): .+$/gm)].map((m) => Number(m[1]));
  const lines = readme.split('\n');
  const at = lines.findIndex((l) => l.startsWith('## Строки KI 2026-10-12'));
  const kiOld = lines[at + 2].split(', ').map(Number);
  return { edge, kiOld };
}

/** svar.jsonl of run (a) and run (b). */
export function runInputs(svar = fixture('svar.synthetic.jsonl')) {
  const { edge, kiOld } = readmeLines();
  const lines = svar.trimEnd().split('\n');
  const skip = new Set([...edge, ...kiOld]);
  const a = lines.filter((_, i) => !skip.has(i + 1));
  const b = lines.filter((_, i) => kiOld.includes(i + 1));
  return { a: `${a.join('\n')}\n`, b: `${b.join('\n')}\n` };
}

function scrape() {
  for (const d of document.querySelectorAll('details')) d.open = true;
  const text = (el) =>
    el.innerText
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  return {
    meta: document.getElementById('meta').textContent.trim(),
    sections: [...document.querySelectorAll('#innhald > section')].map((sec) => ({
      title: sec.querySelector('h2')?.textContent.trim() ?? '',
      tables: [...sec.querySelectorAll('table')].map((t) =>
        [...t.rows].map((r) => [...r.cells].map((c) => c.textContent.replace(/\s+/g, ' ').trim())),
      ),
      lines: text(sec),
    })),
  };
}

async function views(page, kundar, skjemaIds) {
  const out = new Map();
  const slugOf = Object.fromEntries(Object.entries(kundar).map(([slug, name]) => [name, slug]));
  for (const sid of skjemaIds) {
    const tabs = page.locator('#fanar button');
    const index = sid === 'tryggleik' ? 0 : 1;
    await tabs.nth(index).click();
    const chips = page.locator('#filter .gruppe').first().locator('button.chip');
    const n = await chips.count();
    for (let i = 0; i < n; i += 1) {
      const chip = page.locator('#filter .gruppe').first().locator('button.chip').nth(i);
      const label = (await chip.evaluate((b) => b.firstChild.textContent)).trim();
      await chip.click();
      const kunde = i === 0 ? 'alle' : slugOf[label];
      out.set(
        `${sid}.${kunde}.json`,
        `${JSON.stringify({ skjema: sid, kunde, rolle: 'alle', ...(await page.evaluate(scrape)) }, null, 2)}\n`,
      );
    }
  }
  return out;
}

async function run(svar, skjemaIds, withCsv) {
  const server = await startOldServer({
    svar,
    runde1: fixture('runde1.synthetic.js'),
    tilgang: fixture('tilgang.json'),
    kundar: fixture('kundar.json'),
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const origin = new URL(server.base).origin;
    await page.route('**/*', (route) =>
      route.request().url().startsWith(origin) ? route.continue() : route.abort(),
    );
    process.env.PW1 = server.password;
    if (!(await loggInn(page, server.base))) throw new Error('login to the old server failed');
    delete process.env.PW1;
    await page.goto(`${server.base}/dashboard`);
    await page.waitForSelector('#innhald > section');
    const names = await page.evaluate(() => window.KARTLEGGING.kundar);
    const out = await views(page, names, skjemaIds);
    if (withCsv) {
      const res = await page.request.get(`${server.base}/api/analyse.csv`);
      if (!res.ok()) throw new Error(`analyse.csv: ${res.status()}`);
      out.set('analyse.csv', await res.text());
      out.set(
        'paths.json',
        pathsJson(await browserPaths(server, JSON.parse(fixture('tilgang.json')))),
      );
    }
    return out;
  } finally {
    await browser.close();
    await server.stop();
  }
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export async function generateGolden() {
  const { a, b } = runInputs();
  const files = await run(a, ['tryggleik', 'ki'], true);
  for (const [name, body] of await run(b, ['ki'], false)) files.set(`ki-2026-10-12/${name}`, body);
  const tree = kartleggingTree();
  const manifest = {
    kartlegging_tree: tree,
    fixtures: Object.fromEntries(FIXTURE_FILES.map((f) => [f, sha256(fixture(f))])),
    files: Object.fromEntries([...files.keys()].sort().map((f) => [f, sha256(files.get(f))])),
  };
  files.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  return files;
}

function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(dir, full));
    }
  };
  walk(dir);
  return out.sort();
}

export function writeFiles(dir, files) {
  for (const [name, body] of files) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), body);
  }
}

async function main() {
  if (process.argv.includes('--refresh-manifest')) {
    const file = join(GOLDEN, 'manifest.json');
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    // Browser values remain untouched. This flag verifies their existing SHA256 first.
    for (const [name, hash] of Object.entries(manifest.files))
      if (sha256(readFileSync(join(GOLDEN, name))) !== hash)
        throw new Error(`golden checksum differs: ${name}`);
    manifest.kartlegging_tree = kartleggingTree();
    writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
    console.log('golden manifest refreshed; browser parity remains pending');
    return;
  }
  const files = await generateGolden();
  if (!process.argv.includes('--check')) {
    rmSync(GOLDEN, { recursive: true, force: true });
    writeFiles(GOLDEN, files);
    console.log(`golden written: ${files.size} files`);
    return;
  }
  const tmp = mkdtempSync(join(tmpdir(), 'varde-golden-'));
  try {
    writeFiles(tmp, files);
    const fresh = listFiles(tmp);
    const committed = listFiles(GOLDEN);
    const diffs = [...new Set([...fresh, ...committed])].filter((f) => {
      try {
        return readFileSync(join(tmp, f), 'utf8') !== readFileSync(join(GOLDEN, f), 'utf8');
      } catch {
        return true;
      }
    });
    if (diffs.length > 0) {
      console.log(`golden differs: ${diffs.join(', ')}`);
      process.exit(1);
    }
    console.log(`golden: ${fresh.length} files identical`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
