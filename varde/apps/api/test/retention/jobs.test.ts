import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { RetentionRun } from '../../src/modules/retention/run.service.js';
import { dashboardFixture, type DashboardFixture } from '../dashboard/fixture.js';
import { withPg } from '../support/rounds.js';

let f: DashboardFixture, oldSession: string, freshSession: string;
const mark = 'test:retention:' + Date.now();
beforeAll(async () => {
  f = await dashboardFixture();
  await withPg(async (c) => {
    if (
      !(await c.query<{ f: string | null }>("SELECT to_regprocedure('varde_audit.prune()') f"))
        .rows[0].f
    ) {
      await c.query('CREATE SCHEMA IF NOT EXISTS varde_audit');
      await c.query(
        'CREATE TABLE IF NOT EXISTS varde_audit.connection_log (at timestamptz NOT NULL DEFAULT now(), role_name text)',
      );
      const sql = readFileSync(resolve('../../infra/sql/varde-db.sql'), 'utf8');
      await c.query(
        sql.slice(
          sql.indexOf('CREATE FUNCTION varde_audit.prune()'),
          sql.indexOf('ALTER FUNCTION varde_audit.prune()'),
        ),
      );
    }
    await c.query(
      "INSERT INTO varde_audit.connection_log(at,role_name) VALUES ('2020-01-01',$1),(now(),$1)",
      [mark],
    );
  });
  oldSession = (
    await f.prisma.adminSession.create({
      data: { via: 'entra', expires_at: new Date(Date.now() - 31 * 86400_000) },
    })
  ).sid;
  freshSession = (
    await f.prisma.adminSession.create({
      data: { via: 'entra', expires_at: new Date(Date.now() - 29 * 86400_000) },
    })
  ).sid;
  await f.prisma.auditLog.createMany({
    data: [
      { who: mark, what: 'old', at: new Date('2020-01-01') },
      { who: mark, what: 'fresh' },
    ],
  });
  const rc = await f.prisma.roundClient.findFirstOrThrow({ where: { round_id: f.tryggleik } });
  await f.prisma.progressEvent.createMany({
    data: [
      {
        round_client_id: rc.id,
        session_id: mark,
        question_no: 1,
        at: new Date(Date.now() - 25 * 3600_000),
      },
      { round_client_id: rc.id, session_id: mark, question_no: 1, at: new Date() },
    ],
  });
}, 180_000);
afterAll(async () => {
  await f.prisma.progressEvent.deleteMany({ where: { session_id: mark } });
  await f.prisma.adminSession.deleteMany({ where: { sid: { in: [oldSession, freshSession] } } });
  await f.close();
});
it('dry-run counts without committing deletes, including connection prune', async () => {
  const result = await f.app.get(RetentionRun).run(true);
  // Registration and Contact joined the job in 3.1 (test/seminars/participants.test.ts).
  expect(result).toMatchObject({ dry_run: true, skipped: ['Proposal'] });
  expect(result.connection_log).toBeGreaterThan(0);
  expect(result.progress_event).toBeGreaterThan(0);
  expect(result.audit_log).toBeGreaterThan(0);
  expect(await f.prisma.adminSession.findUnique({ where: { sid: oldSession } })).not.toBeNull();
  expect(await f.prisma.auditLog.count({ where: { who: mark } })).toBe(2);
});
it('expired progress is removed; fresh progress remains', async () => {
  const result = await f.app.get(RetentionRun).run();
  expect(result.connection_log).toBeGreaterThan(0);
  expect(await f.prisma.progressEvent.count({ where: { session_id: mark } })).toBe(1);
});
it('sessions expire thirty days after expiry, not creation', async () => {
  expect(await f.prisma.adminSession.findUnique({ where: { sid: oldSession } })).toBeNull();
  expect(await f.prisma.adminSession.findUnique({ where: { sid: freshSession } })).not.toBeNull();
});
it('audit older than twelve months is removed; fresh remains', async () => {
  expect((await f.prisma.auditLog.findMany({ where: { who: mark } })).map((r) => r.what)).toEqual([
    'fresh',
  ]);
});
it('responses and released snapshots are untouched', async () => {
  const before = await withPg(
    async (c) =>
      (
        await c.query<{ r: string; s: string }>(
          'SELECT (SELECT count(*) FROM response) r, (SELECT count(*) FROM aggregate_snapshot) s',
        )
      ).rows,
  );
  await f.app.get(RetentionRun).run();
  const after = await withPg(
    async (c) =>
      (
        await c.query<{ r: string; s: string }>(
          'SELECT (SELECT count(*) FROM response) r, (SELECT count(*) FROM aggregate_snapshot) s',
        )
      ).rows,
  );
  expect(after).toEqual(before);
});
it('second run deletes nothing and invokes the SQL prune function', async () => {
  const r = await f.app.get(RetentionRun).run();
  expect(r).toMatchObject({ progress_event: 0, audit_log: 0, admin_session: 0, connection_log: 0 });
});
