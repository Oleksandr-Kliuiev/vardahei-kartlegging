// Norwegian order and dates (norsk.ts). No browser carries data for `nn`, so a list sorted with
// `localeCompare(…, 'nn')` and a date written with `toLocaleDateString('nn-NO')` come out in the
// language of the browser instead. The last test keeps `nn` out of Intl for good.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { byNorsk, flatNorsk, shortDate } from '../src/norsk.js';

describe('norsk order', () => {
  it('puts æ, ø and å last, whatever language the browser is in', () => {
    expect(['Åsen', 'Ørsta', 'Æra', 'Bergen', 'Amla'].sort(byNorsk)).toEqual([
      'Amla',
      'Bergen',
      'Æra',
      'Ørsta',
      'Åsen',
    ]);
  });
  it('keeps Årdal after the other clients, not among the A-s', () => {
    expect(['Årdal Transport', 'Amla Sag', 'Balestrand Hotell'].sort(byNorsk)).toEqual([
      'Amla Sag',
      'Balestrand Hotell',
      'Årdal Transport',
    ]);
  });
  it('is one name whatever the case', () => {
    expect(flatNorsk(' Kari Nordmann ')).toBe(' kari nordmann ');
    expect(flatNorsk('KARI')).toBe(flatNorsk('kari'));
  });
});

describe('short date', () => {
  it('reads the same wherever the admin is opened', () => {
    expect(shortDate('2026-11-09T08:00:00.000Z')).toBe('09.11.2026');
  });
  it('is Oslo time: an hour past midnight in UTC is already the next day here', () => {
    expect(shortDate('2026-11-08T23:30:00.000Z')).toBe('09.11.2026');
  });
});

/** The guard: `nn` is a language for texts, never a locale for Intl. */
it('no source passes nn to Intl, localeCompare or toLocale…', () => {
  const dir = resolve(process.cwd(), 'src');
  const bad: string[] = [];
  for (const file of readdirSync(dir)) {
    if (!/\.tsx?$/.test(file)) continue;
    const source = readFileSync(join(dir, file), 'utf8');
    for (const [line, text] of source.split('\n').entries()) {
      if (/^\s*(\/\/|\*|\/\*)/.test(text)) continue; // a comment may name the mistake it warns of
      if (/(localeCompare|toLocale\w+|Intl\.\w+)\([^)]*['"]nn(-NO)?['"]/.test(text))
        bad.push(`${file}:${line + 1}`);
    }
  }
  expect(bad).toEqual([]);
});
