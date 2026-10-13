// One rule for 0.4b and 0.12b: every .env example has names only, no values,
// except the explicit allow-list below.
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exampleFiles, violations } from './env-examples.js';
import { VARDE_DIR } from './paths.js';

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
