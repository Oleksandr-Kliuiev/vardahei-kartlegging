// Task 1.2c without a browser: the temporary copy of kartlegging and the inputs of runs (a)/(b).
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FIXTURES } from '../generate.mjs';
import { readmeLines, runInputs } from '../golden.mjs';
import { copyKartlegging, startOldServer } from '../old-server.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'varde-golden-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function list(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(dir, full));
    }
  };
  walk(dir);
  return out;
}

const fixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');

describe('old server and golden inputs (1.2c)', () => {
  it('the copy of kartlegging/ has no data/ and no private/runde1.js of the source', () => {
    copyKartlegging(`${tmp}/k/`);
    const files = list(join(tmp, 'k'));
    expect(files).toContain('server.js');
    expect(files.some((f) => f.split('/').includes('data'))).toBe(false);
    expect(files).not.toContain('private/runde1.js');
  });

  it('the running old server sees only the synthetic runde1.js and its own DATA_DIR', async () => {
    const server = await startOldServer({
      svar: '',
      runde1: fixture('runde1.synthetic.js'),
      tilgang: fixture('tilgang.json'),
      kundar: fixture('kundar.json'),
    });
    try {
      const files = list(server.root);
      expect(files.filter((f) => f.endsWith('runde1.js'))).toEqual([
        'kartlegging/private/runde1.js',
      ]);
      expect(readFileSync(join(server.root, 'kartlegging/private/runde1.js'), 'utf8')).toBe(
        fixture('runde1.synthetic.js'),
      );
      expect(files.some((f) => f.startsWith('kartlegging/data/'))).toBe(false);
      expect((await fetch(`${server.base}/healthz`)).status).toBe(200);
    } finally {
      await server.stop();
    }
  });

  it('run (a) has no edge rows and no KI 2026-10-12 rows; run (b) has only those', () => {
    const { a, b } = runInputs();
    const { edge, kiOld } = readmeLines();
    const all = fixture('svar.synthetic.jsonl').trimEnd().split('\n');
    const rowsA = a.trimEnd().split('\n');
    const rowsB = b.trimEnd().split('\n');
    expect(rowsA).toHaveLength(all.length - edge.length - kiOld.length);
    for (const n of [...edge, ...kiOld]) expect(rowsA).not.toContain(all[n - 1]);
    expect(rowsB).toEqual(kiOld.map((n) => all[n - 1]));
    const parsedB = rowsB.map((l) => JSON.parse(l) as { skjema: string; versjon: string });
    expect(parsedB.every((r) => r.skjema === 'ki' && r.versjon === '2026-10-12')).toBe(true);
    const parsedA = rowsA.map(
      (l) => JSON.parse(l) as { id?: string; skjema: string; versjon: string; k: string },
    );
    expect(parsedA.some((r) => r.skjema === 'ki' && r.versjon === '2026-10-12')).toBe(false);
    expect(
      parsedA.every((r) => r.id !== undefined && ['2026-10-12', '2026-10-13'].includes(r.versjon)),
    ).toBe(true);
  });
});
