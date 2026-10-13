// Varde roles and database on the integration Postgres (0.5): the real infra/sql scripts run
// through psql from the pinned image (no local psql; same client version as the server).
// Roles are cluster-wide, so every test file that creates them also removes them.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { readDbBudget } from '../../src/config/db-budget.js';
import { API_DIR, databaseUrl, withDatabase } from './prisma-cli.js';

export const PG_IMAGE = 'postgres:17.6-bookworm';
export const SQL_DIR = join(API_DIR, '..', '..', 'infra', 'sql');
export const VARDE_ROLES = ['varde_app', 'varde_backup', 'varde_audit_owner'] as const;

export interface RunResult {
  status: number | null;
  output: string;
}

/** Docker args for a client tool of PG_IMAGE against the server of `url` (host network). */
function clientArgs(url: string): { args: string[]; env: NodeJS.ProcessEnv } {
  const u = new URL(url);
  return {
    args: ['run', '--rm', '-i', '--network', 'host', '-e', 'PGPASSWORD', PG_IMAGE],
    env: {
      ...process.env,
      PGPASSWORD: decodeURIComponent(u.password),
    },
  };
}

function connArgs(url: string, db: string): string[] {
  const u = new URL(url);
  return ['-h', u.hostname, '-p', u.port || '5432', '-U', decodeURIComponent(u.username), '-d', db];
}

/** psql of PG_IMAGE with `stdin`; the connection is `url` with database `db`. */
export function psql(url: string, db: string, stdin: string): RunResult {
  const { args, env } = clientArgs(url);
  const run = spawnSync(
    'docker',
    [...args, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...connArgs(url, db)],
    { input: stdin, encoding: 'utf8', env },
  );
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

/** `pg_dump -Fc` of PG_IMAGE as the user of `url`; the dump itself is discarded. */
export function pgDump(url: string): RunResult {
  const u = new URL(url);
  const { args, env } = clientArgs(url);
  const run = spawnSync(
    'docker',
    [
      ...args,
      'sh',
      '-c',
      'pg_dump -Fc "$@" > /dev/null',
      'pg_dump',
      ...connArgs(url, u.pathname.slice(1)),
    ],
    { encoding: 'utf8', env },
  );
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

export function sqlFile(name: string): string {
  return readFileSync(join(SQL_DIR, name), 'utf8');
}

export interface VardeDb {
  dbname: string;
  superUrl: string;
  appUrl: string;
  backupUrl: string;
}

function roleUrl(base: string, role: string, password: string): string {
  const u = new URL(base);
  u.username = role;
  u.password = password;
  return u.toString();
}

/** Superuser client on DATABASE_URL (or another database of the same server). */
export async function superClient(db?: string): Promise<pg.Client> {
  const url = db === undefined ? databaseUrl() : withDatabase(databaseUrl(), db);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

/** Leftovers of an interrupted run: databases owned by varde_app and the Varde roles. */
export async function resetVardeRoles(): Promise<void> {
  const su = await superClient();
  try {
    const owned = await su.query<{ datname: string }>(
      `SELECT datname FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba WHERE r.rolname = 'varde_app'`,
    );
    for (const { datname } of owned.rows) {
      await su.query(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
    }
    for (const role of VARDE_ROLES) await su.query(`DROP ROLE IF EXISTS ${role}`);
  } finally {
    await su.end();
  }
}

/** varde-roles.sql + varde-db.sql with fresh test passwords (never literals). */
export async function createVardeDb(dbname: string): Promise<VardeDb> {
  await resetVardeRoles();
  const superUrl = databaseUrl();
  const appPw = randomBytes(32).toString('hex');
  const backupPw = randomBytes(32).toString('hex');
  const limit = readDbBudget().role_connection_limit;
  const vars = `\\set app_pw ${appPw}\n\\set backup_pw ${backupPw}\n\\set role_limit ${limit}\n\\set dbname ${dbname}\n`;
  const roles = psql(superUrl, 'postgres', vars + sqlFile('varde-roles.sql'));
  if (roles.status !== 0) throw new Error(`varde-roles.sql failed:\n${roles.output}`);
  const db = psql(superUrl, dbname, sqlFile('varde-db.sql'));
  if (db.status !== 0) throw new Error(`varde-db.sql failed:\n${db.output}`);
  const base = withDatabase(superUrl, dbname);
  return {
    dbname,
    superUrl: base,
    appUrl: roleUrl(base, 'varde_app', appPw),
    backupUrl: roleUrl(base, 'varde_backup', backupPw),
  };
}

/** varde-teardown.sql after closing what is still connected to the database. */
export async function dropVardeDb(dbname: string): Promise<void> {
  const su = await superClient();
  try {
    await su.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [dbname],
    );
  } finally {
    await su.end();
  }
  const run = psql(
    databaseUrl(),
    'postgres',
    `\\set dbname ${dbname}\n${sqlFile('varde-teardown.sql')}`,
  );
  if (run.status !== 0) throw new Error(`varde-teardown.sql failed:\n${run.output}`);
}

/** Opens a client on `url`, runs `fn`, closes it. */
export async function withClient<T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** SQLSTATE of the error thrown by `fn` (undefined if it did not throw). */
export async function sqlState(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code ?? 'no-code';
  }
}
