// The phone's side of a live poll (3.6, 3.4): GET /api/runner/live gives only the open question
// (no other question, no count, no result), says waiting / between / done otherwise, follows a
// step at once; answers have their own limits (answers per question, windows per IP and in total)
// so a hall behind one NAT never meets the limits of surveys.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QuotaService } from '../../src/modules/responses/quota.service.js';
import { seminarApp, type SeminarApp } from '../support/seminars.js';
import { answer, cleanupLive, livePoll } from '../support/live.js';
import { runnerRound } from '../support/runner-round.js';
import { CodesService } from '../../src/modules/rounds/codes.js';

let t: SeminarApp;
beforeAll(async () => {
  t = await seminarApp();
});
afterAll(async () => {
  await cleanupLive(t);
  await t.close();
});

const phone = (code: string) =>
  t.call('GET', '/api/runner/live', undefined, { authorization: `Bearer ${code}`, cookie: '' });
const step = (seminar: string, q: string, action: string) =>
  t.call('POST', `/api/admin/seminars/${seminar}/live/questions/${q}/${action}`);

describe('GET /api/runner/live', () => {
  it('waiting → the open question only → between → done', async () => {
    const p = await livePoll(t);
    const waiting = await phone(p.code);
    expect(waiting.statusCode).toBe(200);
    expect(waiting.headers['cache-control']).toBe('no-store');
    expect(waiting.json()).toMatchObject({ state: 'waiting', languages: ['nn', 'en'] });
    expect(waiting.json<{ topic: { nn: string } }>().topic.nn).toContain(t.mark);
    expect(waiting.body).not.toContain('Brukar du tofaktor');

    await step(p.seminar, 'L2', 'open');
    const open = await phone(p.code);
    expect(open.json()).toMatchObject({
      state: 'open',
      no: 2,
      total: 3,
      question: {
        id: 'L2',
        type: 'single',
        texts: { text: { nn: 'Brukar du tofaktor (MFA) på jobb-e-posten?' } },
        options: [{ id: 'ja' }, { id: 'nei' }, { id: 'veit_ikkje' }],
      },
    });
    // Nothing of the other questions, no count, no result.
    expect(open.body).not.toMatch(/Kva arbeider du|stolar på|answered|result|"n"/);

    await answer(t, p.code, 'L2', 'ja');
    await step(p.seminar, 'L2', 'close');
    expect((await phone(p.code)).json()).toMatchObject({ state: 'between' });
    await step(p.seminar, 'L2', 'release');
    expect((await phone(p.code)).json()).toMatchObject({ state: 'between' });
    for (const q of ['L1', 'L3']) {
      await step(p.seminar, q, 'open');
      await step(p.seminar, q, 'close');
    }
    expect((await phone(p.code)).json()).toMatchObject({ state: 'done' });
  });

  it('a survey code gets 404 here; an unknown code 403', async () => {
    const r = await runnerRound(t.prisma, `${t.mark}-survey`, 'open');
    const issued = await t.app.get(CodesService).reissue(r.rc.id, 'test');
    try {
      expect((await phone(issued.code!)).statusCode).toBe(404);
      expect((await phone('A'.repeat(22))).statusCode).toBe(403);
    } finally {
      await t.prisma.revokedRoundCode.deleteMany({ where: { round_client_id: r.rc.id } });
      await t.prisma.roundClient.delete({ where: { id: r.rc.id } });
      await t.prisma.round.delete({ where: { id: r.round.id } });
      await t.prisma.client.delete({ where: { id: r.client.id } });
    }
  });
});

describe('limits of live answers (config/quotas.json)', () => {
  it('answers per question, and a window per IP of its own', async () => {
    const quotas = t.app.get(QuotaService);
    const saved = { ...quotas.limits };
    const limits = quotas.limits;
    try {
      const p = await livePoll(t);
      await step(p.seminar, 'L1', 'open');
      limits.live_per_ip_per_10min = 2;
      expect((await answer(t, p.code, 'L1', 'sal', {}, '203.0.113.1')).statusCode).toBe(201);
      expect((await answer(t, p.code, 'L1', 'sal', {}, '203.0.113.1')).statusCode).toBe(201);
      const third = await answer(t, p.code, 'L1', 'sal', {}, '203.0.113.1');
      expect(third.statusCode).toBe(429);
      expect((await answer(t, p.code, 'L1', 'drift', {}, '203.0.113.2')).statusCode).toBe(201);
      limits.live_per_ip_per_10min = saved.live_per_ip_per_10min;
      limits.live_participants_max = 3;
      expect((await answer(t, p.code, 'L1', 'kontor', {}, '203.0.113.3')).statusCode).toBe(429);
      // The cap is per question: the next question takes answers again.
      await step(p.seminar, 'L1', 'close');
      await step(p.seminar, 'L2', 'open');
      expect((await answer(t, p.code, 'L2', 'ja', {}, '203.0.113.3')).statusCode).toBe(201);
    } finally {
      Object.assign(limits, saved);
    }
  });

  it('sixty phones behind one NAT, in the limits of config/quotas.json: no 429', async () => {
    const p = await livePoll(t);
    await step(p.seminar, 'L2', 'open');
    const results = await Promise.all(
      Array.from({ length: 60 }, (_, i) =>
        answer(t, p.code, 'L2', ['ja', 'nei', 'veit_ikkje'][i % 3], {}, '198.51.100.99'),
      ),
    );
    expect(results.map((r) => r.statusCode).filter((s) => s !== 201)).toEqual([]);
  });
});
