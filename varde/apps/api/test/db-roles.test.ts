// Task 0.5: Varde roles, isolation of the database, read-only backup, protected audit journal.
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readDbBudget } from '../src/config/config-dir.js';
import {
  createVardeDb,
  dropVardeDb,
  pgDump,
  sqlState,
  superClient,
  type VardeDb,
  withClient,
} from './support/varde-db.js';

const DB = 'varde_t';
const ATLAS_PW = randomBytes(16).toString('hex');
let db: VardeDb;

function asRole(url: string, role: string, password: string): string {
  const u = new URL(url);
  u.username = role;
  u.password = password;
  return u.toString();
}

async function journalCount(role: string): Promise<number> {
  const su = await superClient(DB);
  try {
    const r = await su.query<{ n: string }>(
      'SELECT count(*) AS n FROM varde_audit.connection_log WHERE role_name = $1',
      [role],
    );
    return Number(r.rows[0]?.n);
  } finally {
    await su.end();
  }
}

beforeAll(async () => {
  db = await createVardeDb(DB);
  const su = await superClient();
  try {
    await su.query('DROP ROLE IF EXISTS atlas_test');
    await su.query(`CREATE ROLE atlas_test LOGIN PASSWORD '${ATLAS_PW}'`);
  } finally {
    await su.end();
  }
});

afterAll(async () => {
  await dropVardeDb(DB);
  const su = await superClient();
  try {
    await su.query('DROP ROLE IF EXISTS atlas_test');
  } finally {
    await su.end();
  }
});

describe('Varde roles and database (0.5)', () => {
  it('(1) a foreign role cannot connect to the Varde database', async () => {
    const url = asRole(db.superUrl, 'atlas_test', ATLAS_PW);
    await expect(withClient(url, (c) => c.query('SELECT 1'))).rejects.toThrow(
      /permission denied for database/,
    );
  });

  it('(2) varde_backup reads the journal but cannot write it', async () => {
    await withClient(db.backupUrl, async (c) => {
      expect(
        await sqlState(() => c.query('INSERT INTO varde_audit.connection_log DEFAULT VALUES')),
      ).toBe('42501');
      const r = await c.query('SELECT count(*) FROM varde_audit.connection_log');
      expect(r.rowCount).toBe(1);
    });
  });

  it('(3) a varde_app login adds one journal row', async () => {
    const before = await journalCount('varde_app');
    await withClient(db.appUrl, (c) => c.query('SELECT 1'));
    expect(await journalCount('varde_app')).toBe(before + 1);
  });

  it('(4) connection limit from db-budget, no pg_read_all_data', async () => {
    const su = await superClient();
    try {
      const r = await su.query<{ rolname: string; rolconnlimit: number; reads_all: boolean }>(
        `SELECT rolname, rolconnlimit, pg_has_role(oid, 'pg_read_all_data', 'MEMBER') AS reads_all
           FROM pg_roles WHERE rolname IN ('varde_app', 'varde_backup', 'varde_audit_owner')
          ORDER BY rolname`,
      );
      const byName = Object.fromEntries(r.rows.map((row) => [row.rolname, row]));
      expect(byName.varde_app?.rolconnlimit).toBe(readDbBudget().role_connection_limit);
      expect(byName.varde_backup?.rolconnlimit).toBe(3);
      expect(r.rows.map((row) => row.reads_all)).toEqual([false, false, false]);
    } finally {
      await su.end();
    }
  });

  it('(5) varde_app cannot drop, empty or unhook the journal', async () => {
    await withClient(db.appUrl, async (c) => {
      for (const sql of [
        'DROP TABLE varde_audit.connection_log',
        'DELETE FROM varde_audit.connection_log',
        'DROP FUNCTION varde_audit.log_login() CASCADE',
        'DROP EVENT TRIGGER varde_login',
      ]) {
        // 42501 insufficient_privilege: "permission denied …" or "must be owner of …"
        expect(await sqlState(() => c.query(sql)), sql).toBe('42501');
      }
    });
    const before = await journalCount('varde_app');
    await withClient(db.appUrl, (c) => c.query('SELECT 1'));
    expect(await journalCount('varde_app')).toBe(before + 1);
  });

  it('(6) pg_dump -Fc as varde_backup covers a schema varde_app creates later', async () => {
    await withClient(db.appUrl, async (c) => {
      await c.query('CREATE SCHEMA q');
      await c.query('CREATE TABLE q.t (id serial PRIMARY KEY, v text)');
      await c.query('CREATE SEQUENCE q.s');
      await c.query("INSERT INTO q.t (v) VALUES ('x')");
    });
    const dump = pgDump(db.backupUrl);
    expect(dump.status, dump.output).toBe(0);
  });

  it('(7) prune() removes rows older than 12 months, only for varde_app', async () => {
    const su = await superClient(DB);
    try {
      await su.query(
        `INSERT INTO varde_audit.connection_log (at, role_name) VALUES
           (now() - interval '13 months', 'old_marker'), (now() - interval '1 day', 'new_marker')`,
      );
    } finally {
      await su.end();
    }
    await withClient(db.backupUrl, async (c) => {
      await expect(c.query('SELECT varde_audit.prune()')).rejects.toThrow(
        /permission denied for function prune/,
      );
    });
    await withClient(db.appUrl, (c) => c.query('SELECT varde_audit.prune()'));
    expect(await journalCount('old_marker')).toBe(0);
    expect(await journalCount('new_marker')).toBe(1);
  });
});
