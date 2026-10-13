// One rule for 0.4b and 0.12b: every .env example has names only, no values,
// except the explicit allow-list below.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VARDE_DIR } from './paths.js';

const ALLOWED_VALUES = new Set([
  'PORT=3000',
  'VARDE_BREAK_GLASS_SOCKET=/run/varde/break-glass.sock',
]);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.selfcheck']);

function exampleFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...exampleFiles(full));
    } else if (entry.name === '.env.example' || entry.name.endsWith('.env.example')) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Returns offending lines: `KEY=value` outside the allow-list, anything not `KEY=`, and
 * commented-out values (`# KEY=value`).
 */
export function violations(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) => line !== '' && !(line.startsWith('#') && !/^#\s*[A-Z][A-Z0-9_]*=\S/.test(line)),
    )
    .filter((line) => !/^[A-Z][A-Z0-9_]*=$/.test(line) && !ALLOWED_VALUES.has(line));
}

describe('.env examples contain names only', () => {
  const files = exampleFiles(VARDE_DIR);

  it('finds the example files', () => {
    expect(files.map((f) => relative(VARDE_DIR, f))).toContain('apps/api/.env.example');
  });

  it.each(files.map((f) => [relative(VARDE_DIR, f), f]))('%s has no values', (_rel, file) => {
    expect(violations(readFileSync(file, 'utf8'))).toEqual([]);
  });

  it('rejects values, allows the fixed exceptions', () => {
    expect(violations('# c\nDATABASE_URL=\nPORT=3000\n')).toEqual([]);
    expect(
      violations('SESSION_SECRET=abc\nPORT=8080\nexport X=\n# TOKEN=xyz\n# note: KEY= only\n'),
    ).toEqual(['SESSION_SECRET=abc', 'PORT=8080', 'export X=', '# TOKEN=xyz']);
  });
});
