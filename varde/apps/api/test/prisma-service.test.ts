import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configDir, readDbBudget } from '../src/config/config-dir.js';
import { withConnectionLimit } from '../src/prisma/prisma.service.js';

describe('withConnectionLimit', () => {
  it('adds connection_limit to DATABASE_URL', () => {
    expect(withConnectionLimit('postgresql://u:p@h:5432/db', 8)).toBe(
      'postgresql://u:p@h:5432/db?connection_limit=8',
    );
  });

  it('overrides an existing value and keeps other params', () => {
    expect(withConnectionLimit('postgresql://u:p@h/db?schema=public&connection_limit=50', 8)).toBe(
      'postgresql://u:p@h/db?schema=public&connection_limit=8',
    );
  });
});

describe('db-budget', () => {
  it('reads varde/config by default', () => {
    expect(readDbBudget({})).toEqual({
      role_connection_limit: 20,
      prisma_pool: 8,
      pgboss_pool: 4,
      reserve: 8,
    });
  });

  it('honours VARDE_CONFIG_DIR', () => {
    const dir = mkdtempSync(join(tmpdir(), 'varde-config-'));
    writeFileSync(
      join(dir, 'db-budget.json'),
      JSON.stringify({ role_connection_limit: 10, prisma_pool: 2, pgboss_pool: 2, reserve: 6 }),
    );
    expect(configDir({ VARDE_CONFIG_DIR: dir })).toBe(dir);
    expect(readDbBudget({ VARDE_CONFIG_DIR: dir }).prisma_pool).toBe(2);
  });

  it('rejects an invalid budget', () => {
    const dir = mkdtempSync(join(tmpdir(), 'varde-config-'));
    writeFileSync(join(dir, 'db-budget.json'), JSON.stringify({ prisma_pool: -1 }));
    expect(() => readDbBudget({ VARDE_CONFIG_DIR: dir })).toThrow();
  });
});
