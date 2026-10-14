import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp } from '../../src/bootstrap.js';
import { CodesService, codeHash, deadlineExpiry, issueCode } from '../../src/modules/rounds/codes.js';
import { SessionStore } from '../../src/modules/auth/session.store.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { captureOutput, type Captured } from '../support/capture-output.js';
import { removeRunnerRound, runnerRound } from '../support/runner-round.js';

let app: NestFastifyApplication;
let prisma: PrismaService;
let codes: CodesService;
let out: Captured;
const mark = `test.codes.${Date.now()}`;
const rounds: string[] = [];
const secrets: string[] = [];

beforeAll(async () => {
  out = captureOutput();
  app = await createApp();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  prisma = app.get(PrismaService);
  codes = app.get(CodesService);
});
afterAll(async () => {
  for (const id of rounds) await removeRunnerRound(prisma, id);
  await prisma.auditLog.deleteMany({ where: { who: mark } });
  await app.close();
  out.restore();
});
async function issued(expires?: Date) {
  const { rc, round } = await runnerRound(prisma, mark);
  rounds.push(round.id);
  const result = await codes.reissue(rc.id, mark, expires);
  secrets.push(result.code!);
  return result;
}
const get = (code: string, query = '') => app.getHttpAdapter().getInstance().inject({
  method: 'GET', url: `/api/runner/round${query}`, headers: { authorization: `Bearer ${code}` },
});

describe('access codes (1.18)', () => {
  it('22 base64url characters decode to 16 random bytes; fresh codes differ', () => {
    const all = Array.from({ length: 100 }, issueCode);
    expect(new Set(all).size).toBe(100);
    for (const code of all) {
      expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(Buffer.from(code, 'base64url')).toHaveLength(16);
    }
  });
  it('unknown code → 403', async () => {
    const res = await get(issueCode());
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ message: 'Lenkja er ikkje gyldig.' });
  });
  it('query and cookie cannot provide a bearer code', async () => {
    const rc = await issued();
    expect((await get('', `?c=${rc.code}`)).statusCode).toBe(403);
    const res = await app.getHttpAdapter().getInstance().inject({
      method: 'GET', url: '/api/runner/round', headers: { cookie: `c=${rc.code}` },
    });
    expect(res.statusCode).toBe(403);
  });
  it('revoked code → its own 403 text', async () => {
    const rc = await issued();
    await codes.revoke(rc.id, mark);
    const res = await get(rc.code!);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ message: 'Lenkja er bytt ut. Spør den som sende deg ho om den nye.' });
  });
  it('after repeated reissue all old codes → 403, current → 200', async () => {
    const first = await issued();
    const second = await codes.reissue(first.id, mark);
    const third = await codes.reissue(first.id, mark);
    expect((await get(first.code!)).statusCode).toBe(403);
    expect((await get(second.code!)).statusCode).toBe(403);
    expect((await get(third.code!)).statusCode).toBe(200);
    expect(await codes.resolveCode(first.code!)).toBe('revoked');
  });
  it('explicit expiry → 410', async () => {
    const rc = await issued(new Date(Date.now() - 1000));
    expect((await get(rc.code!)).statusCode).toBe(410);
  });
  it('deadline expires at end of Norwegian day (winter and summer)', () => {
    expect(deadlineExpiry(new Date('2026-01-12')).toISOString()).toBe('2026-01-12T23:00:00.000Z');
    expect(deadlineExpiry(new Date('2026-06-12')).toISOString()).toBe('2026-06-12T22:00:00.000Z');
  });
  it('AuditLog contains only hash prefixes, never bearer codes', async () => {
    const rc = await issued();
    const row = await prisma.auditLog.findFirstOrThrow({ where: { who: mark, target: `round_client:${rc.id}` } });
    expect(row.what).toBe('rounds.code.issue');
    expect(row.details).toEqual({ hash: codeHash(rc.code!).slice(0, 12) });
    const audit = JSON.stringify(await prisma.auditLog.findMany({ where: { who: mark } }));
    for (const code of secrets) expect(audit).not.toContain(code);
  });
  it('a failed database write cannot expose the generated code; code/history/audit roll back', async () => {
    const rc = await issued();
    const before = await prisma.auditLog.count({ where: { who: mark, target: `round_client:${rc.id}` } });
    const session = await app.get(SessionStore).create({ oid: mark, name: mark, via: 'entra', expiresAt: new Date(Date.now() + 3600_000) });
    const cookie = app.getHttpAdapter().getInstance().signCookie(session.sid);
    await prisma.$executeRawUnsafe('ALTER TABLE round_client ADD CONSTRAINT codes_test_fail CHECK (code IS NULL) NOT VALID');
    try {
      const result = await app.getHttpAdapter().getInstance().inject({
        method: 'POST', url: `/api/admin/round-clients/${rc.id}/reissue`,
        headers: { cookie: `varde_session=${encodeURIComponent(cookie)}` },
      });
      expect(result.statusCode).toBe(503);
      expect(result.json()).toMatchObject({ message: 'Lenkja kunne ikkje lagast. Prøv igjen.' });
      expect(out.text()).not.toMatch(/code_hash|code: \"|codes_test_fail/);
      expect(await prisma.revokedRoundCode.count({ where: { code_hash: rc.code_hash! } })).toBe(0);
      expect(await prisma.auditLog.count({ where: { who: mark, target: `round_client:${rc.id}` } })).toBe(before);
      expect((await get(rc.code!)).statusCode).toBe(200);
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE round_client DROP CONSTRAINT codes_test_fail');
      await prisma.adminSession.delete({ where: { sid: session.sid } });
    }
  });
  it('403 log never contains the Authorization code; successful runner calls are unlogged', async () => {
    const rc = await issued();
    await get(rc.code!);
    await codes.revoke(rc.id, mark);
    await get(rc.code!);
    expect(out.text()).not.toContain(rc.code!);
    const lines = out.lines().filter((line) => line.startsWith('{')).map((line) => JSON.parse(line) as { path: string; status: number });
    expect(lines.filter((line) => line.path === '/api/runner/round').every((line) => line.status >= 400)).toBe(true);
  });
});
