// Task 0.7: table admin_session on Postgres — store contract, CHECK on via, session + AuditLog
// in one transaction, migration down/up.
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaSessionStore } from '../src/modules/auth/session.store.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { API_DIR, databaseUrl, prisma as prismaCli } from './support/prisma-cli.js';

const prisma = new PrismaService();
const store = new PrismaSessionStore(prisma);
const MARK = `test.admin-session.${Date.now()}`;
const MIGRATION = '20261013140000_admin_session';

afterAll(async () => {
  await prisma.adminSession.deleteMany({ where: { name: MARK } });
  await prisma.auditLog.deleteMany({ where: { who: MARK } });
  await prisma.$disconnect();
});

const inHour = () => new Date(Date.now() + 3600_000);

describe('admin_session (0.7)', () => {
  it('create → find → revoke', async () => {
    const s = await store.create({ oid: 'o', name: MARK, via: 'entra', expiresAt: inHour() });
    expect(s.sid).toMatch(/^[0-9a-f-]{36}$/);
    expect((await store.find(s.sid))?.revokedAt).toBeNull();
    await store.revoke(s.sid, new Date());
    expect((await store.find(s.sid))?.revokedAt).toBeInstanceOf(Date);
    expect(await store.find('not-a-uuid')).toBeNull();
  });

  it('revokeVia closes only sessions of that kind', async () => {
    const bg = await store.create({
      oid: null,
      name: MARK,
      via: 'break_glass',
      expiresAt: inHour(),
    });
    const en = await store.create({ oid: 'o', name: MARK, via: 'entra', expiresAt: inHour() });
    expect(await store.revokeVia('break_glass', new Date())).toBeGreaterThanOrEqual(1);
    expect((await store.find(bg.sid))?.revokedAt).not.toBeNull();
    expect((await store.find(en.sid))?.revokedAt).toBeNull();
  });

  it('via outside {entra, break_glass} is rejected by the database', async () => {
    await expect(
      prisma.adminSession.create({ data: { name: MARK, via: 'password', expires_at: inHour() } }),
    ).rejects.toThrow();
  });

  it('session + AuditLog: a failing audit insert leaves no session', async () => {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE audit_log ADD CONSTRAINT admin_session_test_fail CHECK (what <> 'test.fail')`,
    );
    try {
      const before = await prisma.adminSession.count({ where: { name: MARK } });
      await expect(
        store.create(
          { oid: null, name: MARK, via: 'break_glass', expiresAt: inHour() },
          { who: MARK, what: 'test.fail' },
        ),
      ).rejects.toThrow();
      expect(await prisma.adminSession.count({ where: { name: MARK } })).toBe(before);
      await store.create(
        { oid: null, name: MARK, via: 'break_glass', expiresAt: inHour() },
        { who: MARK, what: 'test.ok' },
      );
      expect(await prisma.auditLog.count({ where: { who: MARK, what: 'test.ok' } })).toBe(1);
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE audit_log DROP CONSTRAINT admin_session_test_fail',
      );
    }
  });

  it('migration down.sql removes the table, deploy restores it', async () => {
    await prisma.adminSession.deleteMany({ where: { name: MARK } });
    const url = databaseUrl();
    const down = prismaCli(
      [
        'db',
        'execute',
        '--url',
        url,
        '--file',
        join(API_DIR, 'prisma', 'migrations', MIGRATION, 'down.sql'),
      ],
      url,
    );
    expect(down.status, down.output).toBe(0);
    const gone = await prisma.$queryRaw<
      { t: string | null }[]
    >`SELECT to_regclass('admin_session')::text AS t`;
    expect(gone[0]?.t).toBeNull();
    const up = prismaCli(['migrate', 'deploy'], url);
    expect(up.status, up.output).toBe(0);
    const back = await prisma.$queryRaw<
      { t: string | null }[]
    >`SELECT to_regclass('admin_session')::text AS t`;
    expect(back[0]?.t).toBe('admin_session');
  });
});
