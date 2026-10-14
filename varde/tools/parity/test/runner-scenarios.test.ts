import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../generate.mjs';
import { sourcePaths } from '../runner-scenarios.mjs';
import { pathsJson } from '../runner-paths.mjs';
import { GOLDEN } from '../golden.mjs';

describe('runner paths reference (1.13c; browser verification is in parity:golden)', () => {
  it('12 paths are reproducible from actual synthetic fixture rows and old path functions', () => {
    const paths = sourcePaths() as { scenarios: { id: string; survey: string; line: number; answers: object; path: string[] }[] };
    expect(paths.scenarios).toHaveLength(12);
    expect(readFileSync(join(GOLDEN, 'paths.json'), 'utf8')).toBe(pathsJson(paths));
    const rows = readFileSync(join(FIXTURES, 'svar.synthetic.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line) as { svar: object });
    // Answers are the fixture row minus synthetic partial scales (the old UI cannot send those).
    for (const s of paths.scenarios) {
      const row = rows[s.line - 1]!.svar as Record<string, unknown>;
      for (const [key, value] of Object.entries(s.answers)) expect(value).toEqual(row[key]);
      expect(Object.keys(row).length - Object.keys(s.answers).length).toBeLessThanOrEqual(1);
    }
    expect(paths.scenarios.filter((s) => s.survey === 'tryggleik')).toHaveLength(6);
    expect(paths.scenarios.filter((s) => s.survey === 'ki')).toHaveLength(6);
    expect(paths.scenarios.find((s) => s.id === 'ki-ingen')!.path).not.toContain('K16');
    expect(paths.scenarios.find((s) => s.id === 'ki-fleire')!.path).toContain('K16');
    expect(paths.scenarios.find((s) => s.id === 'tryggleik-leiar')!.path).toContain('B-intro');
    expect(paths.scenarios.find((s) => s.id === 'tryggleik-kontor')!.path).not.toContain('B-intro');
  });
});
