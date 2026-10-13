import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkBudget, countLines } from './check.mjs';

let root: string;

function file(rel: string, lines: number): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, Array.from({ length: lines }, (_, i) => `// ${i}`).join('\n') + '\n');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'budget-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('context-budget', () => {
  it('counts lines with and without a trailing newline', () => {
    expect(countLines('a\nb\n')).toBe(2);
    expect(countLines('a\nb')).toBe(2);
    expect(countLines('')).toBe(0);
  });

  it('rejects a 701-line file', () => {
    file('apps/api/src/long.ts', 701);
    expect(checkBudget(root).over).toEqual([{ path: 'apps/api/src/long.ts', lines: 701 }]);
  });

  it('accepts a 700-line file with a warning', () => {
    file('apps/api/src/edge.css', 700);
    const result = checkBudget(root);
    expect(result.over).toEqual([]);
    expect(result.warnings).toEqual([{ path: 'apps/api/src/edge.css', lines: 700 }]);
  });

  it('checks every budgeted extension', () => {
    for (const ext of ['ts', 'tsx', 'js', 'mjs', 'cjs', 'css', 'scss', 'sql', 'prisma']) {
      file(`x/long.${ext}`, 701);
    }
    expect(checkBudget(root).over).toHaveLength(9);
  });

  it('ignores node_modules, dist, coverage, prisma/migrations and data fixtures', () => {
    file('node_modules/pkg/index.js', 900);
    file('apps/admin/dist/app.js', 900);
    file('coverage/lcov.js', 900);
    file('apps/api/prisma/migrations/20261013_audit_log/migration.sql', 900);
    file('tools/x/fixtures/data.json', 900);
    file('tools/x/fixtures/data.jsonl', 900);
    file('docs/long.md', 900);
    const result = checkBudget(root);
    expect(result.over).toEqual([]);
    expect(result.scanned).toBe(0);
  });

  it('still budgets prisma/schema.prisma outside migrations', () => {
    file('apps/api/prisma/schema.prisma', 701);
    expect(checkBudget(root).over).toHaveLength(1);
  });
});
