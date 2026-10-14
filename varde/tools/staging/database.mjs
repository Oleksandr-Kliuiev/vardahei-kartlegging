// Dedicated synthetic databases only. Never accepts the current database as a drop target.
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { Client } = require('pg');

const [action, name] = process.argv.slice(2);
if (
  !/^(varde_staging|varde_rehearsal_[a-z0-9]+)$/.test(name) ||
  !['create', 'drop'].includes(action)
)
  throw new Error('dedicated synthetic database required');
const url = new URL(process.env.DATABASE_URL);
if (url.pathname.slice(1) === name) throw new Error('use parent DATABASE_URL');
const client = new Client({ connectionString: url.toString() });
await client.connect();
try {
  if (action === 'create') await client.query(`CREATE DATABASE "${name}"`);
  else {
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()',
      [name],
    );
    await client.query(`DROP DATABASE IF EXISTS "${name}"`);
  }
} finally {
  await client.end();
}
