// Connection budget of varde_app (ADR-003, 0.4/0.9): the only source of pool sizes for
// PrismaService (prisma_pool) and pg-boss (pgboss_pool). Test: test/db-budget.test.ts.
import { readConfigJson } from './config-dir.js';

export interface DbBudget {
  role_connection_limit: number;
  prisma_pool: number;
  pgboss_pool: number;
  reserve: number;
}

export function readDbBudget(env: NodeJS.ProcessEnv = process.env): DbBudget {
  const raw = readConfigJson('db-budget.json', env);
  const budget = raw as Partial<DbBudget>;
  for (const key of ['role_connection_limit', 'prisma_pool', 'pgboss_pool', 'reserve'] as const) {
    const value = budget[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new Error(`db-budget.json: ${key} must be a non-negative integer`);
    }
  }
  return budget as DbBudget;
}
