import 'reflect-metadata';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  submissionApp,
  submissionRound,
  submissionBody,
  postSubmission,
  storedSubmissions,
  cleanupSubmissions,
} from '../support/submissions.js';
import { RoundsService } from '../../src/modules/rounds/rounds.service.js';
import { withPg } from '../support/rounds.js';

let t: Awaited<ReturnType<typeof submissionApp>>;
const rounds: string[] = [];
beforeAll(async () => {
  t = await submissionApp();
});
afterAll(async () => {
  await cleanupSubmissions(t.prisma, rounds);
  await t.app.close();
});
async function fresh(mode: 'initials' | 'none' = 'initials', population = 100) {
  const f = await submissionRound(t, mode, population);
  rounds.push(f.round.id);
  return f;
}
it('query codes never authorise API submissions or round reads', async () => {
  const f = await fresh();
  const api = t.app.getHttpAdapter().getInstance();
  expect(
    (
      await api.inject({
        method: 'POST',
        url: '/api/runner/submissions?c=' + f.code,
        payload: submissionBody(),
      })
    ).statusCode,
  ).toBe(403);
  expect((await t.get('/api/runner/round?c=' + f.code)).statusCode).toBe(403);
  expect(await storedSubmissions(f.rc.id)).toEqual([]);
});
it('anonymous answers cannot hide an identifier under an unrecognised key', async () => {
  const f = await fresh('none');
  const result = await postSubmission(
    t,
    f.code,
    submissionBody({ K1: 'kontor', foreign_identifier: 'ZZTEST' }),
  );
  expect(result.statusCode).toBe(400);
  expect(await storedSubmissions(f.rc.id)).toEqual([]);
});
it('common and leader both consume the RoundClient quota', async () => {
  const f = await fresh('initials', 1);
  for (let i = 0; i < 15; i++) {
    expect((await postSubmission(t, f.code, submissionBody())).statusCode).toBe(201);
    expect(
      (
        await postSubmission(t, f.code, {
          ...submissionBody({ F1: 'ZZTEST', B13: 'ja' }),
          part: 'leader',
          role: 'leiar',
        })
      ).statusCode,
    ).toBe(201);
  }
  expect((await postSubmission(t, f.code, submissionBody())).statusCode).toBe(429);
  const rows = await storedSubmissions(f.rc.id);
  expect(rows.filter((r) => r.part === 'common')).toHaveLength(15);
  expect(rows.filter((r) => r.part === 'leader')).toHaveLength(15);
});
it('a shared UUID racing on different RoundClients inserts once and reports conflict', async () => {
  const a = await fresh(),
    b = await fresh(),
    body = submissionBody();
  const result = await Promise.all([
    postSubmission(t, a.code, body),
    postSubmission(t, b.code, body),
  ]);
  expect(result.map((r) => r.statusCode).sort()).toEqual([201, 409]);
  expect(
    (await storedSubmissions(a.rc.id)).length + (await storedSubmissions(b.rc.id)).length,
  ).toBe(1);
});
it('close queued before submission blocks it and never inserts after closure', async () => {
  const f = await fresh();
  await withPg(async (c) => {
    await c.query('BEGIN');
    await c.query('SELECT id FROM round WHERE id=$1 FOR UPDATE', [f.round.id]);
    const closing = t.app.get(RoundsService).close(f.round.id, 'test:race');
    try {
      let waiting = false;
      for (let i = 0; i < 100; i++) {
        await c.query('SELECT pg_stat_clear_snapshot()');
        const result = await c.query<{ n: string }>(
          "SELECT count(*) n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%FROM round%FOR UPDATE%'",
        );
        if (Number(result.rows[0]!.n) > 0) {
          waiting = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(waiting).toBe(true);
      const pending = postSubmission(t, f.code, submissionBody());
      await c.query('COMMIT');
      await closing;
      expect((await pending).statusCode).toBe(410);
    } catch (error) {
      await c.query('ROLLBACK');
      await closing.catch(() => {});
      throw error;
    }
  });
  expect(await storedSubmissions(f.rc.id)).toEqual([]);
});
it('runner and admin CSP are complete, assets cannot serve their parent directory', async () => {
  const session = await t.store.create({
    oid: 'test:csp',
    name: 'synthetic',
    via: 'entra',
    expiresAt: new Date(Date.now() + 3600_000),
  });
  const cookie = { '__Host-varde_session': t.app.getHttpAdapter().getInstance().signCookie(session.sid) };
  for (const path of ['/r', '/admin']) {
    const r = await t.get(path, cookie);
    expect(r.statusCode).toBe(200);
    const csp = r.headers['content-security-policy'];
    expect(typeof csp).toBe('string');
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
    for (const directive of [
      "script-src 'self'",
      "style-src 'self'",
      "font-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
    ])
      expect(csp).toContain(directive);
  }
  for (const path of [
    '/r/assets/..%2findex.html',
    '/admin/assets/..%2findex.html',
    '/r/assets/index.html',
    '/admin/assets/index.html',
  ])
    expect((await t.get(path, cookie)).statusCode).toBe(404);
});
