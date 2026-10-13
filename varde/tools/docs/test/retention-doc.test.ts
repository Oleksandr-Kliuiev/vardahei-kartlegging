// Task 0.19: every row of docs/varde/RETENTION.md names a class or an external copy of
// varde/config/retention.json, and every class and copy has a row.
import { describe, expect, it } from 'vitest';
import { readDoc, tableRows } from './support.js';

interface Retention {
  classes: Record<string, unknown>;
  external_copies: { name: string; owner: string }[];
}

const config = JSON.parse(readDoc('varde/config/retention.json')) as Retention;
const doc = readDoc('docs/varde/RETENTION.md');

/** First column of every table row, without backticks. */
const firstColumns = (text: string): string[] =>
  tableRows(text).map((row) => (row.split('|')[1] ?? '').trim().replace(/`/g, ''));

describe('docs/varde/RETENTION.md (0.19)', () => {
  const [, inside = '', outside = ''] = doc.split(/^## /m);

  it('rows of "Классы в Varde" = classes of retention.json', () => {
    expect(firstColumns(inside).sort()).toEqual(Object.keys(config.classes).sort());
  });

  it('rows of "Копии вне Varde" = external_copies, including restore-kopi', () => {
    const names = config.external_copies.map((c) => c.name);
    expect(names).toContain('restore-kopi');
    expect(firstColumns(outside).sort()).toEqual([...names].sort());
  });

  it('the owner of each external copy matches the config', () => {
    for (const row of tableRows(outside)) {
      const cells = row.split('|').map((c) => c.trim());
      const copy = config.external_copies.find((c) => `\`${c.name}\`` === cells[1]);
      expect(copy?.owner, cells[1]).toBe(cells[4]);
    }
  });

  it('states the 128-day backup window and the absence of a response timer', () => {
    expect(doc).toMatch(/128 дней/);
    expect(doc).toMatch(/таймера нет/);
  });
});
