// Live poll of a seminar (3.4): the server leads the states of the questions (waiting → open →
// closed → released, closed → open again until shown), one question open at a time, answers only
// to the open question («Spørsmålet er stengt.» otherwise), every step in AuditLog, the database
// refuses what the service refuses, and the live round stays out of the round and client lists.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seminarApp, type SeminarApp } from '../support/seminars.js';
import { withPg } from '../support/rounds.js';
import {
  answer,
  cleanupLive,
  livePoll,
  liveVersion,
  todayOslo,
  type LivePoll,
} from '../support/live.js';

let t: SeminarApp;
beforeAll(async () => {
  t = await seminarApp();
});
afterAll(async () => {
  await cleanupLive(t);
  await t.close();
});

const step = (p: LivePoll, q: string, action: 'open' | 'close' | 'release') =>
  t.call('POST', `/api/admin/seminars/${p.seminar}/live/questions/${q}/${action}`);
const states = async (p: LivePoll) =>
  Object.fromEntries(
    (
      await t.prisma.livePollQuestion.findMany({
        where: { round_id: p.round },
        orderBy: { position: 'asc' },
      })
    ).map((q) => [q.question_id, q.state]),
  );

describe('making the poll', () => {
  it('a live round with one RoundClient on the technical seminar client, a code and waiting questions', async () => {
    const p = await livePoll(t);
    const round = await t.prisma.round.findUniqueOrThrow({
      where: { id: p.round },
      include: { round_clients: { include: { client: true } } },
    });
    expect(round).toMatchObject({ type: 'live', identification: 'none', status: 'open' });
    expect(round.round_clients).toHaveLength(1);
    expect(round.round_clients[0]!.client.kind).toBe('seminar');
    expect(round.round_clients[0]!.population_snapshot).toBeNull();
    expect(p.code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await states(p)).toEqual({ L1: 'waiting', L2: 'waiting', L3: 'waiting' });
    const seminar = await t.prisma.seminar.findUniqueOrThrow({ where: { id: p.seminar } });
    expect(seminar.round_live_id).toBe(p.round);
    // The participant link expires with the presenter window (the day after the seminar, Oslo).
    expect(round.round_clients[0]!.code_expires_at!.getTime()).toBeGreaterThan(
      Date.now() + 86_400_000,
    );
    const created = await t.prisma.auditLog.findFirstOrThrow({
      where: { what: 'seminars.live.create', target: `seminar:${p.seminar}` },
    });
    expect(JSON.stringify(created.details)).not.toContain(p.code);
    // A second poll for the same seminar is refused.
    expect(
      (
        await t.call('POST', `/api/admin/seminars/${p.seminar}/live`, {
          template_version_id: p.version,
        })
      ).statusCode,
    ).toBe(409);
  });

  it('only versions made for live questions: anonymous, choices only, each question on its own', async () => {
    const { id } = await (
      await import('../support/seminars.js')
    ).createSeminar(t, { date: todayOslo() });
    const cases: [string, Parameters<typeof liveVersion>[1]][] = [
      [
        'initialar',
        (c) => ({
          ...c,
          identification: 'initials',
          questions: [
            {
              id: 'I1',
              part: 'common',
              type: 'text',
              identifier: true,
              single_line: true,
              uppercase: true,
              max_length: 8,
              texts: { text: { nn: 'Initialar', en: 'Initials' } },
            },
            ...c.questions,
          ],
        }),
      ],
      [
        'fritekst',
        (c) => ({
          ...c,
          questions: c.questions.map((q) =>
            q.id === 'L2' && q.type === 'single'
              ? { ...q, free_text: { texts: { text: { nn: 'Kvifor?', en: 'Why?' } } } }
              : q,
          ),
        }),
      ],
      [
        'heng saman',
        (c) => ({
          ...c,
          questions: c.questions.map((q) =>
            q.id === 'L2' ? { ...q, visible_if: { '==': [{ var: 'L1' }, 'kontor'] } } : q,
          ),
        }),
      ],
    ];
    for (const [label, edit] of cases) {
      const version = await liveVersion(t, edit);
      const res = await t.call('POST', `/api/admin/seminars/${id}/live`, {
        template_version_id: version,
      });
      expect(res.statusCode, label).toBe(400);
      expect(res.json<{ message: string }>().message, label).toContain(label);
    }
    const panel = (await t.call('GET', `/api/admin/seminars/${id}/live`)).json<{
      poll: unknown;
      versions: { id: string; problem: string | null }[];
    }>();
    expect(panel.poll).toBeNull();
    expect(panel.versions.some((v) => v.problem === null)).toBe(true);
    expect(panel.versions.some((v) => v.problem?.includes('initialar'))).toBe(true);
  });

  it("moving the seminar moves the end of the phones' link with the presenter window", async () => {
    const p = await livePoll(t);
    const body = (await import('../support/seminars.js')).seminarBody(t, { date: todayOslo(1) });
    expect((await t.call('PUT', `/api/admin/seminars/${p.seminar}`, body)).statusCode).toBe(200);
    const s = await t.prisma.seminar.findUniqueOrThrow({ where: { id: p.seminar } });
    const rc = await t.prisma.roundClient.findFirstOrThrow({ where: { round_id: p.round } });
    const { presenterWindow } = await import('../../src/modules/live/window.js');
    expect(rc.code_expires_at!.toISOString()).toBe(presenterWindow(s).to.toISOString());
    expect(rc.code_expires_at!.getTime()).toBeGreaterThan(Date.now() + 2 * 86_400_000);
  });

  it('removing works only before anything is asked; the link and key stop with it', async () => {
    const p = await livePoll(t);
    expect((await t.call('DELETE', `/api/admin/seminars/${p.seminar}/live`)).statusCode).toBe(200);
    expect(await t.prisma.round.findUnique({ where: { id: p.round } })).toBeNull();
    expect(
      (await t.prisma.seminar.findUniqueOrThrow({ where: { id: p.seminar } })).round_live_id,
    ).toBeNull();
    const again = await livePoll(t);
    expect((await step(again, 'L1', 'open')).statusCode).toBe(200);
    expect((await t.call('DELETE', `/api/admin/seminars/${again.seminar}/live`)).statusCode).toBe(
      409,
    );
  });
});

describe('states led by the server', () => {
  it('waiting → open → closed → released, AuditLog on every step, double clicks are no-ops', async () => {
    const p = await livePoll(t);
    expect((await step(p, 'L2', 'release')).statusCode).toBe(409);
    expect((await step(p, 'L2', 'close')).statusCode).toBe(409);
    expect((await step(p, 'L2', 'open')).statusCode).toBe(200);
    expect((await step(p, 'L2', 'open')).statusCode).toBe(200);
    expect((await step(p, 'L2', 'release')).json<{ message: string }>().message).toBe(
      'Steng spørsmålet før du viser resultatet.',
    );
    expect((await step(p, 'L2', 'close')).statusCode).toBe(200);
    expect((await step(p, 'L2', 'release')).statusCode).toBe(200);
    expect((await step(p, 'L2', 'release')).statusCode).toBe(200);
    expect(await states(p)).toMatchObject({ L2: 'released' });
    const log = await t.prisma.auditLog.findMany({
      where: { target: `round:${p.round}`, what: { startsWith: 'seminars.live.' } },
      orderBy: { at: 'asc' },
    });
    expect(log.map((l) => l.what)).toEqual([
      'seminars.live.open',
      'seminars.live.close',
      'seminars.live.release',
    ]);
    expect(log.every((l) => l.who === `entra:test:seminar-admin`)).toBe(true);
    expect(log[0]!.details).toEqual({ question: 'L2', no: 2 });
  });

  it('a closed question may open again until it is shown; a shown one is final', async () => {
    const p = await livePoll(t);
    await step(p, 'L1', 'open');
    await step(p, 'L1', 'close');
    expect((await step(p, 'L1', 'open')).statusCode).toBe(200);
    await step(p, 'L1', 'close');
    await step(p, 'L1', 'release');
    const reopen = await step(p, 'L1', 'open');
    expect(reopen.statusCode).toBe(409);
    expect(reopen.json<{ message: string }>().message).toContain('Resultatet er vist');
  });

  it('one question open at a time', async () => {
    const p = await livePoll(t);
    await step(p, 'L1', 'open');
    const second = await step(p, 'L2', 'open');
    expect(second.statusCode).toBe(409);
    expect(second.json<{ message: string }>().message).toBe(
      'Spørsmål 1 er ope. Steng det før du opnar eit nytt.',
    );
    await step(p, 'L1', 'close');
    expect((await step(p, 'L2', 'open')).statusCode).toBe(200);
  });

  it('the database refuses a skipped step, a second open question and a changed place', async () => {
    const p = await livePoll(t);
    const sql = (q: string, params: unknown[]) => withPg((c) => c.query(q, params));
    await expect(
      sql(
        `UPDATE live_poll_question SET state = 'released' WHERE round_id = $1 AND question_id = 'L1'`,
        [p.round],
      ),
    ).rejects.toThrow(/live_poll_question_step/);
    await sql(
      `UPDATE live_poll_question SET state = 'open' WHERE round_id = $1 AND question_id = 'L1'`,
      [p.round],
    );
    await expect(
      sql(
        `UPDATE live_poll_question SET state = 'open' WHERE round_id = $1 AND question_id = 'L2'`,
        [p.round],
      ),
    ).rejects.toThrow(/live_poll_question_one_open/);
    await sql(
      `UPDATE live_poll_question SET state = 'closed' WHERE round_id = $1 AND question_id = 'L1'`,
      [p.round],
    );
    await sql(
      `UPDATE live_poll_question SET state = 'released' WHERE round_id = $1 AND question_id = 'L1'`,
      [p.round],
    );
    await expect(
      sql(
        `UPDATE live_poll_question SET state = 'open' WHERE round_id = $1 AND question_id = 'L1'`,
        [p.round],
      ),
    ).rejects.toThrow(/live_poll_question_step/);
    await expect(
      sql(`UPDATE live_poll_question SET position = 9 WHERE round_id = $1 AND question_id = 'L3'`, [
        p.round,
      ]),
    ).rejects.toThrow(/keeps its place/);
  });

  it('the technical client belongs to live rounds only, and live rounds have only it', async () => {
    const p = await livePoll(t);
    const seminarClient = await t.prisma.client.findFirstOrThrow({ where: { kind: 'seminar' } });
    const regular = await t.prisma.client.create({
      data: { slug: `${t.mark}-regular`, name: `Vanleg ${t.mark}` },
    });
    const survey = await t.prisma.round.create({
      data: { name: `${t.mark} survey`, type: 'regular' },
    });
    try {
      await expect(
        t.prisma.roundClient.create({ data: { round_id: survey.id, client_id: seminarClient.id } }),
      ).rejects.toThrow();
      await expect(
        t.prisma.roundClient.create({ data: { round_id: p.round, client_id: regular.id } }),
      ).rejects.toThrow();
      await expect(
        t.prisma.client.update({ where: { id: regular.id }, data: { kind: 'seminar' } }),
      ).rejects.toThrow();
      await expect(
        t.prisma.round.update({ where: { id: p.round }, data: { type: 'regular' } }),
      ).rejects.toThrow();
    } finally {
      await t.prisma.round.delete({ where: { id: survey.id } });
      await t.prisma.client.delete({ where: { id: regular.id } });
    }
  });
});

describe('answers', () => {
  it('only to the open question; a closed one is refused with «Spørsmålet er stengt.»', async () => {
    const p = await livePoll(t);
    const early = await answer(t, p.code, 'L2', 'ja');
    expect(early.statusCode).toBe(409);
    expect(early.json<{ message: string }>().message).toBe('Spørsmålet er ikkje ope enno.');
    await step(p, 'L2', 'open');
    expect((await answer(t, p.code, 'L2', 'ja')).statusCode).toBe(201);
    expect((await answer(t, p.code, 'L3', ['melder'])).statusCode).toBe(409);
    // Nothing but one answer: no free text, no role, one question per submission.
    expect((await answer(t, p.code, 'L2', 'nei', { free: { L2: 'tekst' } })).statusCode).toBe(400);
    expect((await answer(t, p.code, 'L2', 'nei', { part: 'leader', role: 'x' })).statusCode).toBe(
      400,
    );
    expect((await answer(t, p.code, 'L2', 'tull')).statusCode).toBe(400);
    const sameId = { submission_id: crypto.randomUUID() };
    expect((await answer(t, p.code, 'L2', 'nei', sameId)).statusCode).toBe(201);
    await step(p, 'L2', 'close');
    const late = await answer(t, p.code, 'L2', 'nei');
    expect(late.statusCode).toBe(409);
    expect(late.json<{ message: string }>().message).toBe('Spørsmålet er stengt.');
    // A replay of a stored answer (lost acknowledgement) still gets its 201 after the close.
    expect((await answer(t, p.code, 'L2', 'nei', sameId)).statusCode).toBe(201);
    const stored = await withPg(
      async (c) =>
        (
          await c.query<{ answers: object; respondent_key: string | null; free: object }>(
            'SELECT answers, respondent_key, free FROM response WHERE round_client_id = (SELECT id FROM round_client WHERE round_id = $1)',
            [p.round],
          )
        ).rows,
    );
    expect(stored).toHaveLength(2);
    for (const r of stored) {
      expect(r.respondent_key).toBeNull();
      expect(r.free).toEqual({});
      expect(Object.keys(r.answers)).toEqual(['L2']);
    }
  });

  it('the runner gets no survey for a live code, and no progress is kept', async () => {
    const p = await livePoll(t);
    const round = await t.call('GET', '/api/runner/round', undefined, {
      authorization: `Bearer ${p.code}`,
      cookie: '',
    });
    expect(round.statusCode).toBe(200);
    expect(round.json()).toEqual({ type: 'live' });
    const progress = await t.call(
      'POST',
      '/api/runner/progress',
      { session_id: 'a'.repeat(24), question_no: 1 },
      { authorization: `Bearer ${p.code}`, cookie: '' },
    );
    expect(progress.statusCode).toBe(409);
  });
});

describe('the rest of the admin keeps out', () => {
  it('no live round in the round lists, no technical client in the client lists, no round admin on it', async () => {
    const p = await livePoll(t);
    const rounds = (await t.call('GET', '/api/admin/rounds')).json<{ id: string }[]>();
    expect(rounds.some((r) => r.id === p.round)).toBe(false);
    const clients = (await t.call('GET', '/api/admin/clients')).json<{ slug: string }[]>();
    expect(clients.some((c) => c.slug === 'varde-seminar-live')).toBe(false);
    const rc = await t.prisma.roundClient.findFirstOrThrow({ where: { round_id: p.round } });
    for (const [method, url] of [
      ['POST', `/api/admin/rounds/${p.round}/close`],
      ['POST', `/api/admin/rounds/${p.round}/release`],
      ['POST', `/api/admin/round-clients/${rc.id}/reissue`],
      ['POST', `/api/admin/round-clients/${rc.id}/close`],
    ] as const)
      expect((await t.call(method, url)).statusCode, url).toBe(409);
    const seminarClient = await t.prisma.client.findFirstOrThrow({ where: { kind: 'seminar' } });
    expect(
      (
        await t.call('PUT', `/api/admin/clients/${seminarClient.id}`, {
          name: 'x',
          employee_count: 1,
        })
      ).statusCode,
    ).toBe(404);
  });
});
