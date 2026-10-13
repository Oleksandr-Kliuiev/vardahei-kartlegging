import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** varde/config relative to this file (src/config or dist/config inside apps/api). */
const DEFAULT_CONFIG_DIR = resolve(__dirname, '../../../../config');

/** Directory with varde/config/*.json; `/out/config` in the image (VARDE_CONFIG_DIR). */
export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  const dir = env.VARDE_CONFIG_DIR;
  return dir === undefined || dir === '' ? DEFAULT_CONFIG_DIR : dir;
}

export interface DbBudget {
  role_connection_limit: number;
  prisma_pool: number;
  pgboss_pool: number;
  reserve: number;
}

export function readDbBudget(env: NodeJS.ProcessEnv = process.env): DbBudget {
  const raw = JSON.parse(readFileSync(join(configDir(env), 'db-budget.json'), 'utf8')) as unknown;
  const budget = raw as Partial<DbBudget>;
  for (const key of ['role_connection_limit', 'prisma_pool', 'pgboss_pool', 'reserve'] as const) {
    const value = budget[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new Error(`db-budget.json: ${key} must be a non-negative integer`);
    }
  }
  return budget as DbBudget;
}
