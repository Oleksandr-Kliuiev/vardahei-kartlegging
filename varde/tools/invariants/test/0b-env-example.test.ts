// Task 0.12b: every environment variable the api reads (apps/api/src, config/* first of all) is
// listed in apps/api/.env.example, and no .env example carries a value (same rule as 0.4b).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exampleFiles, violations } from './env-examples.js';
import { VARDE_DIR } from './paths.js';

const SRC = join(VARDE_DIR, 'apps/api/src');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sources(join(dir, e.name))
      : e.name.endsWith('.ts')
        ? [join(dir, e.name)]
        : [],
  );
}

/** Names read as env.X, env['X'], process.env.X, or listed as 'X' literals in src/config/*. */
export function envNames(file: string, text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(/\benv(?:\.|\[')([A-Z][A-Z0-9_]*)/g)) names.add(m[1] ?? '');
  if (file.includes('/src/config/')) {
    for (const m of text.matchAll(/'([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|PORT)'/g)) names.add(m[1] ?? '');
  }
  return [...names];
}

function exampleNames(): Set<string> {
  const text = readFileSync(join(VARDE_DIR, 'apps/api/.env.example'), 'utf8');
  return new Set([...text.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1] ?? ''));
}

describe('apps/api/.env.example covers the api environment (0.12b)', () => {
  const read = new Map<string, string>();
  for (const file of sources(SRC)) {
    for (const name of envNames(file, readFileSync(file, 'utf8'))) read.set(name, file);
  }

  it('finds the variables of config/* (auth, break-glass, db)', () => {
    for (const name of [
      'ENTRA_CLIENT_KEY_FILE',
      'VARDE_BREAK_GLASS_UNTIL',
      'VARDE_CONFIG_DIR',
    ]) {
      expect(read.has(name), name).toBe(true);
    }
  });

  it('lists every variable that src reads', () => {
    const listed = exampleNames();
    const missing = [...read.keys()].filter((n) => !listed.has(n)).sort();
    expect(missing).toEqual([]);
  });

  it('no example file has a value (allow-list of 0.4b only)', () => {
    for (const file of exampleFiles(VARDE_DIR)) {
      expect(violations(readFileSync(file, 'utf8')), file).toEqual([]);
    }
  });

  it('detects env reads', () => {
    expect(
      envNames('x/src/config/a.ts', "value(env, 'ENTRA_X'); env.PORT; process.env['B_C']"),
    ).toEqual(expect.arrayContaining(['ENTRA_X', 'PORT', 'B_C']));
  });
});
