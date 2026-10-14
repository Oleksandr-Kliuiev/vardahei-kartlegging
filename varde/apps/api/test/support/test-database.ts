// A first-release assertion needs a fresh database: immutable issue history is never reset.
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { databaseUrl, withDatabase, prisma } from './prisma-cli.js';

export async function temporaryDatabase() {
  const original = databaseUrl();
  const name = 'varde_test_' + randomUUID().replaceAll('-', '');
  const parent = new pg.Client({ connectionString: original });
  await parent.connect();
  await parent.query(`CREATE DATABASE "${name}"`);
  const url = withDatabase(original, name);
  const migrated = prisma(['migrate', 'deploy'], url);
  const drop = async () => {
    await parent.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',
      [name],
    );
    await parent.query(`DROP DATABASE "${name}"`);
    await parent.end();
  };
  if (migrated.status !== 0) {
    await drop();
    throw new Error('synthetic database migration failed');
  }
  process.env.DATABASE_URL = url;
  return async () => {
    process.env.DATABASE_URL = original;
    await drop();
  };
}
