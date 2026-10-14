// pnpm --filter @varde/tools-convert convert --from <sporsmal.js> [--out <dir>] [--check]
// Writes config/seed/{templates/*.json, clients.json, import-map.json}; --check regenerates into
// a temporary folder and prints a diff report against --out (default ../../config/seed).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffSeed, seedFromSources, writeSeed } from './generate.js';
import { gitSource } from './load.js';

const DEFAULT_OUT = fileURLToPath(new URL('../../../config/seed', import.meta.url));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const from = arg('from');
if (from === undefined) {
  console.error('usage: convert --from <sporsmal.js> [--out <dir>] [--check]');
  process.exit(2);
}
// pnpm --filter runs in the package directory; paths are relative to where pnpm was started.
const base = process.env.INIT_CWD ?? process.cwd();
const fromPath = resolve(base, from);
const out = resolve(base, arg('out') ?? DEFAULT_OUT);
const files = seedFromSources(readFileSync(fromPath, 'utf8'), gitSource(fromPath));

if (process.argv.includes('--check')) {
  const tmp = mkdtempSync(join(tmpdir(), 'varde-convert-'));
  try {
    writeSeed(tmp, files);
    const diffs = diffSeed(out, files);
    for (const d of diffs) console.log(d);
    console.log(`diff-report: ${diffs.length} differences`);
    process.exit(diffs.length === 0 ? 0 : 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
writeSeed(out, files);
console.log(`wrote ${files.size} files to ${out}`);
