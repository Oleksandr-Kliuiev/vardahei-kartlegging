import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDoc, REPO, tableRows } from './support.js';

const PATH = /`((?:docs|varde|\.github|kartlegging|astra)\/[^`]*)`(\s*\(появится в [^)]+\))?/g;

describe('docs/varde/AI_CONTEXT_MAP.md', () => {
  const map = readDoc('docs/varde/AI_CONTEXT_MAP.md');
  const rows = tableRows(map);

  it('has at least 6 task rows', () => {
    expect(rows.length).toBeGreaterThanOrEqual(6);
  });

  it('covers the required tasks', () => {
    for (const task of [
      'модуль api',
      'схему шаблона',
      'метрику',
      'privacy',
      'миграцию',
      'runner',
      'CI',
      'restore',
      'ADR',
    ]) {
      expect(
        rows.some((row) => row.includes(task)),
        task,
      ).toBe(true);
    }
  });

  it('every path without "(появится в …)" exists', () => {
    const missing: string[] = [];
    let checked = 0;
    for (const row of rows) {
      for (const match of row.matchAll(PATH)) {
        if (match[2]) continue;
        const rel = (match[1] ?? '').replace(/\*.*$/, '');
        checked += 1;
        if (!existsSync(join(REPO, rel))) missing.push(rel);
      }
    }
    expect(checked).toBeGreaterThan(10);
    expect(missing).toEqual([]);
  });

  it('has "Не читать" and "История" sections', () => {
    expect(map).toMatch(
      /## Не читать[\s\S]*kartlegging\/data\/[\s\S]*kjelder\/[\s\S]*runde1\.js[\s\S]*astra\/\*-log\.txt/,
    );
    expect(map).toMatch(/## История[\s\S]*varde-arkitektura\.md[\s\S]*ENDRINGAR-etter-rev33\.md/);
  });
});

describe('docs/AI_CONTEXT_MAP.md', () => {
  it('points to kartlegging and Varde maps in at most 10 lines', () => {
    const root = readDoc('docs/AI_CONTEXT_MAP.md');
    expect(root.trimEnd().split('\n').length).toBeLessThanOrEqual(10);
    expect(root).toContain('docs/kartlegging-teknisk.md');
    expect(root).toContain('docs/varde/AI_CONTEXT_MAP.md');
  });
});
