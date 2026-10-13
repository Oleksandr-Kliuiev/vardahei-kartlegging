import { describe, expect, it } from 'vitest';
import { readDoc, tableRows } from './support.js';

describe('docs/varde/REVIEW-CHECKLIST.md', () => {
  const checklist = readDoc('docs/varde/REVIEW-CHECKLIST.md');

  it('asks one question per principle 1–22', () => {
    for (let n = 1; n <= 22; n += 1) expect(checklist).toMatch(new RegExp(`^${n}\\. .+\\?`, 'm'));
  });

  it('has a leak table with the required rows', () => {
    const section = checklist.split('## Таблица утечек')[1]?.split('\n## ')[0] ?? '';
    const rows = tableRows(section).map((row) => row.toLowerCase());
    for (const key of [
      'итог',
      'малые клиенты',
      'экспорт',
      'timestamp',
      'respondent_key',
      'leader',
    ]) {
      expect(
        rows.some((row) => row.includes(key)),
        key,
      ).toBe(true);
    }
  });
});
