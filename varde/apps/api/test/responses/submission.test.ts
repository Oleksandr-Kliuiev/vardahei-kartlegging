import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { QuotaService } from '../../src/modules/responses/quota.service.js';
import {
  cleanupSubmissions,
  forgetSubmission,
  postSubmission,
  storedSubmissions,
  submissionApp,
  submissionBody,
  submissionRound,
} from '../support/submissions.js';

let t: Awaited<ReturnType<typeof submissionApp>>;
const saved = { ...process.env };
const rounds: string[] = [];
beforeAll(async () => {
  t = await submissionApp();
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await cleanupSubmissions(t.prisma, rounds);
  await t.app.close();
  process.env = saved;
});
async function fresh(mode: 'initials' | 'none' = 'initials') {
  const f = await submissionRound(t, mode);
  rounds.push(f.round.id);
  return f;
}

describe('Submission API (1.16)', () => {
  it('replay returns identical 201, one row and consumes quota only at insert', async () => {
    const f = await fresh(),
      body = submissionBody();
    const consume = vi.spyOn(t.app.get(QuotaService), 'consume');
    const first = await postSubmission(t, f.code, body),
      replay = await postSubmission(t, f.code, body);
    expect(first.statusCode, first.body).toBe(201);
    expect(replay.body).toBe(first.body);
    expect(await storedSubmissions(f.rc.id)).toHaveLength(1);
    expect(consume).toHaveBeenCalledTimes(1);
  });
  it('canonical hash ignores object key order', async () => {
    const f = await fresh(),
      body = submissionBody({ F1: 'ZZTEST', F12: 'ja' });
    await postSubmission(t, f.code, body);
    expect(
      (await postSubmission(t, f.code, { ...body, answers: { F12: 'ja', F1: 'ZZTEST' } }))
        .statusCode,
    ).toBe(201);
  });
  it('same id, different raw content → 409', async () => {
    const f = await fresh(),
      body = submissionBody();
    await postSubmission(t, f.code, body);
    expect(
      (await postSubmission(t, f.code, { ...body, answers: { F1: 'OTHER' } })).statusCode,
    ).toBe(409);
  });
  it('replay after forget returns same 201 without resurrecting data or consuming quota', async () => {
    const f = await fresh(),
      body = submissionBody();
    const first = await postSubmission(t, f.code, body);
    await forgetSubmission(t.prisma, body.submission_id);
    const consume = vi.spyOn(t.app.get(QuotaService), 'consume');
    const replay = await postSubmission(t, f.code, body);
    expect(replay.statusCode).toBe(201);
    expect(replay.body).toBe(first.body);
    expect(await storedSubmissions(f.rc.id)).toEqual([]);
    expect(consume).not.toHaveBeenCalled();
  });
  it('tombstone with different content → 409', async () => {
    const f = await fresh(),
      body = submissionBody();
    await postSubmission(t, f.code, body);
    await forgetSubmission(t.prisma, body.submission_id);
    expect((await postSubmission(t, f.code, { ...body, duration_s: 20 })).statusCode).toBe(409);
  });
  it('lost client acknowledgement after commit → replay succeeds', async () => {
    const f = await fresh(),
      body = submissionBody();
    // Deliberately discard the committed response, as a disconnected client does.
    await postSubmission(t, f.code, body);
    expect((await postSubmission(t, f.code, body)).json()).toEqual({
      ok: true,
      submission_id: body.submission_id,
    });
    expect(await storedSubmissions(f.rc.id)).toHaveLength(1);
  });
  it('concurrent replay creates exactly one row', async () => {
    const f = await fresh(),
      body = submissionBody();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => postSubmission(t, f.code, body)),
    );
    expect(results.map((r) => r.statusCode)).toEqual([201, 201, 201, 201]);
    expect(await storedSubmissions(f.rc.id)).toHaveLength(1);
  });
  it('hidden questions and options, free text and foreign part are pruned', async () => {
    const f = await fresh('none');
    const res = await postSubmission(t, f.code, {
      ...submissionBody({ K1: 'anna', K3: ['ingen'], K16: ['claude'], L2: 'ja' }),
      free: { K16: 'hidden' },
    });
    expect(res.statusCode, res.body).toBe(201);
    expect((await storedSubmissions(f.rc.id))[0]!.answers).not.toHaveProperty('K16');
    expect((await storedSubmissions(f.rc.id))[0]!.answers).not.toHaveProperty('L2');
    expect((await storedSubmissions(f.rc.id))[0]!.free).not.toHaveProperty('K16');
  });
  it('both identified parts have normalized key, no identifier in answers or free, no FK between parts', async () => {
    const f = await fresh();
    const common = submissionBody({ F1: ' zztest ', F2: f.content.leader_roles[0] });
    const leader = {
      ...submissionBody({ F1: ' zztest ' }),
      part: 'leader',
      role: f.content.leader_roles[0],
    };
    for (const body of [common, leader])
      expect(
        (await postSubmission(t, f.code, { ...body, free: { F1: 'forbidden' } })).statusCode,
      ).toBe(201);
    const rows = await storedSubmissions(f.rc.id);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.respondent_key).toBe('ZZTEST');
      expect(row.answers).not.toHaveProperty('F1');
      expect(row.free).not.toHaveProperty('F1');
    }
    expect(new Set(rows.map((r) => r.submission_id)).size).toBe(2);
  });
  it('identified common and leader require identifier; leader requires valid role', async () => {
    const f = await fresh();
    for (const body of [
      submissionBody({}),
      { ...submissionBody({}), part: 'leader', role: f.content.leader_roles[0] },
      { ...submissionBody(), part: 'leader' },
      { ...submissionBody(), part: 'leader', role: 'invalid' },
    ])
      expect((await postSubmission(t, f.code, body)).statusCode).toBe(400);
  });
  it('anonymous parts store null key; extra fields including respondent_key rejected', async () => {
    const f = await fresh('none');
    expect((await postSubmission(t, f.code, submissionBody({ K1: 'anna' }))).statusCode).toBe(201);
    expect((await storedSubmissions(f.rc.id))[0]!.respondent_key).toBeNull();
    expect(
      (
        await postSubmission(t, f.code, {
          ...submissionBody({ L2: ['planlegging'] }),
          part: 'leader',
          role: 'leiar',
        })
      ).statusCode,
    ).toBe(201);
    const rows = await storedSubmissions(f.rc.id);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.respondent_key).toBeNull();
    expect(
      (await postSubmission(t, f.code, submissionBody({ K0: 'ZZTEST', K1: 'anna' }))).statusCode,
    ).toBe(400);
    for (const extra of [
      { respondent_key: 'ZZTEST' },
      { version_id: f.version.id },
      { session_id: '0'.repeat(16) },
    ])
      expect(
        (await postSubmission(t, f.code, { ...submissionBody({}), ...extra })).statusCode,
      ).toBe(400);
  });
  it('closed or expired RoundClient → 410; missing bearer → 403', async () => {
    const f = await fresh();
    expect((await postSubmission(t, '', submissionBody())).statusCode).toBe(403);
    await t.prisma.roundClient.update({ where: { id: f.rc.id }, data: { status: 'closed' } });
    expect((await postSubmission(t, f.code, submissionBody())).statusCode).toBe(410);
    await t.prisma.roundClient.update({
      where: { id: f.rc.id },
      data: { status: 'open', deadline: new Date('2020-01-01') },
    });
    expect((await postSubmission(t, f.code, submissionBody())).statusCode).toBe(410);
  });
  it('submitted_day has date-only precision; language restricted to version', async () => {
    const f = await fresh();
    expect((await postSubmission(t, f.code, { ...submissionBody(), lang: 'nb' })).statusCode).toBe(
      400,
    );
    expect((await postSubmission(t, f.code, submissionBody())).statusCode).toBe(201);
    const day = (await storedSubmissions(f.rc.id))[0]!.submitted_day;
    expect(day).toBe(new Date().toISOString().slice(0, 10));
  });
  it('identifier scope cannot be replayed onto another RoundClient', async () => {
    const a = await fresh(),
      b = await fresh(),
      body = submissionBody();
    expect((await postSubmission(t, a.code, body)).statusCode).toBe(201);
    expect((await postSubmission(t, b.code, body)).statusCode).toBe(409);
    await forgetSubmission(t.prisma, body.submission_id);
    expect((await postSubmission(t, b.code, body)).statusCode).toBe(409);
    expect(await storedSubmissions(b.rc.id)).toEqual([]);
  });
  it('choices_from and exclusive options are enforced by the server, beyond client controls', async () => {
    const f = await fresh('none');
    expect(
      (
        await postSubmission(
          t,
          f.code,
          submissionBody({ K1: 'kontor', K3: ['epost', 'plan'], K16: 'epost' }),
        )
      ).statusCode,
    ).toBe(201);
    expect((await storedSubmissions(f.rc.id))[0]!.answers.K16).toBe('epost');
    const outside = submissionBody({ K1: 'kontor', K3: ['epost', 'plan'], K16: 'leite' });
    expect((await postSubmission(t, f.code, outside)).statusCode).toBe(201);
    expect(
      (await storedSubmissions(f.rc.id)).find((r) => r.submission_id === outside.submission_id)!
        .answers,
    ).not.toHaveProperty('K16');
    expect(
      (
        await postSubmission(
          t,
          f.code,
          submissionBody({ K1: 'kontor', K3: ['epost', 'ingen'], K16: ['epost'] }),
        )
      ).statusCode,
    ).toBe(201);
    const rows = await storedSubmissions(f.rc.id);
    const exclusive = rows.find(
      (r) => Array.isArray(r.answers.K3) && r.answers.K3.includes('ingen'),
    )!;
    expect(exclusive.answers.K3).toEqual(['ingen']);
    expect(exclusive.answers).not.toHaveProperty('K16');
  });
});
