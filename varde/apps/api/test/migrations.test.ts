import { randomBytes } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API_DIR, databaseUrl, prisma, withDatabase } from './support/prisma-cli.js';

const MIGRATIONS = join(API_DIR, 'prisma', 'migrations');
const migrationNames = readdirSync(MIGRATIONS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const dbName = `varde_mig_${randomBytes(4).toString('hex')}`;
const admin = new PrismaClient({ datasourceUrl: databaseUrl() });
const url = withDatabase(databaseUrl(), dbName);

beforeAll(async () => {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
});

afterAll(async () => {
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.$disconnect();
});

async function appliedMigrations(): Promise<string[]> {
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    const rows = await client.$queryRawUnsafe<{ migration_name: string }[]>(
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name',
    );
    return rows.map((row) => row.migration_name);
  } finally {
    await client.$disconnect();
  }
}

describe('migrations forward and back on an empty database', () => {
  it('has a down.sql ending with its own _prisma_migrations delete', async () => {
    const { readFileSync } = await import('node:fs');
    expect(migrationNames.length).toBeGreaterThan(0);
    for (const name of migrationNames) {
      const lines = readFileSync(join(MIGRATIONS, name, 'down.sql'), 'utf8')
        .trimEnd()
        .split('\n');
      expect(lines.at(-1)).toBe(
        `DELETE FROM "_prisma_migrations" WHERE migration_name = '${name}';`,
      );
    }
  });

  it('deploy → down.sql in reverse → empty → deploy → matches schema', async () => {
    const first = prisma(['migrate', 'deploy'], url);
    expect(first.status, first.output).toBe(0);
    expect(await appliedMigrations()).toEqual(migrationNames);

    for (const name of [...migrationNames].reverse()) {
      const down = prisma(
        ['db', 'execute', '--url', url, '--file', join(MIGRATIONS, name, 'down.sql')],
        url,
      );
      expect(down.status, down.output).toBe(0);
    }
    expect(await appliedMigrations()).toEqual([]);
    const empty = prisma(['migrate', 'diff', '--from-url', url, '--to-empty', '--exit-code'], url);
    expect(empty.status, empty.output).toBe(0);

    const again = prisma(['migrate', 'deploy'], url);
    expect(again.status, again.output).toBe(0);
    expect(await appliedMigrations()).toEqual(migrationNames);
    const same = prisma(
      [
        'migrate',
        'diff',
        '--from-url',
        url,
        '--to-schema-datamodel',
        'prisma/schema.prisma',
        '--exit-code',
      ],
      url,
    );
    expect(same.status, same.output).toBe(0);
    expect(same.output).toContain('No difference detected');
  });
});
