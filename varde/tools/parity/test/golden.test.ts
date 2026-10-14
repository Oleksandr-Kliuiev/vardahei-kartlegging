// Task 1.2c with chromium (job e2e): a fresh run of both old-server runs gives the committed golden.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateGolden, GOLDEN } from '../golden.mjs';

describe('golden of the old dashboard (1.2c)', () => {
  it('a repeated run gives the same files as golden/', async () => {
    const files = (await generateGolden()) as Map<string, string>;
    expect(files.size).toBeGreaterThanOrEqual(20);
    for (const [name, body] of files)
      expect(readFileSync(join(GOLDEN, name), 'utf8'), name).toBe(body);
  });
});
