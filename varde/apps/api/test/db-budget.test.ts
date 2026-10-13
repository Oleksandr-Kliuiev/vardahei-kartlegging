// Task 0.9: one connection budget for Prisma + pg-boss, numbers only from config/db-budget.json.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDbBudget } from '../src/config/db-budget.js';

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sources(join(dir, e.name))
      : e.name.endsWith('.ts')
        ? [join(dir, e.name)]
        : [],
  );
}

describe('db budget', () => {
  it('prisma_pool + pgboss_pool ≤ role_connection_limit − reserve', () => {
    const b = readDbBudget();
    expect(b.prisma_pool + b.pgboss_pool).toBeLessThanOrEqual(b.role_connection_limit - b.reserve);
  });

  it('src/ has no connection_limit= literal (the pool sizes come from db-budget.json)', () => {
    const offenders = sources(join(__dirname, '..', 'src')).filter((f) =>
      /connection_limit=/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('pg-boss gets max = pgboss_pool', () => {
    const module = readFileSync(join(__dirname, '..', 'src', 'jobs', 'jobs.module.ts'), 'utf8');
    expect(module).toMatch(/max: readDbBudget\(\)\.pgboss_pool/);
  });
});
