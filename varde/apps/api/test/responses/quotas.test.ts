import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuotaService } from '../../src/modules/responses/quota.service.js';
import { PrivacyService } from '../../src/modules/privacy/privacy.service.js';
import {
  cleanupSubmissions,
  postSubmission,
  storedSubmissions,
  submissionApp,
  submissionBody,
  submissionRound,
} from '../support/submissions.js';

let t: Awaited<ReturnType<typeof submissionApp>>;
const saved = { ...process.env },
  rounds: string[] = [];
let baseline: QuotaService['limits'];
beforeAll(async () => {
  t = await submissionApp();
  baseline = { ...t.app.get(QuotaService).limits };
});
beforeEach(() => {
  Object.assign(t.app.get(QuotaService).limits, baseline);
});
afterAll(async () => {
  await cleanupSubmissions(t.prisma, rounds);
  await t.app.close();
  process.env = saved;
});
async function fresh(population = 100) {
  const f = await submissionRound(t, 'initials', population);
  rounds.push(f.round.id);
  return f;
}

describe('insertion quotas (1.17)', () => {
  it('60 submissions from one NAT IP pass within RoundClient quota', async () => {
    const f = await fresh();
    for (let i = 0; i < 60; i++)
      expect((await postSubmission(t, f.code, submissionBody(), '192.0.2.60')).statusCode).toBe(
        201,
      );
    expect(await storedSubmissions(f.rc.id)).toHaveLength(60);
  });
  it('RoundClient minimum quota and concurrent final slots cannot be exceeded', async () => {
    const f = await fresh(1);
    for (let i = 0; i < 29; i++)
      expect((await postSubmission(t, f.code, submissionBody(), '192.0.2.30')).statusCode).toBe(
        201,
      );
    const results = await Promise.all([
      postSubmission(t, f.code, submissionBody()),
      postSubmission(t, f.code, submissionBody()),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 429]);
    expect(await storedSubmissions(f.rc.id)).toHaveLength(30);
  });
  it('population × factor governs the quota above minimum; replay at exhausted quota passes', async () => {
    const f = await fresh(11),
      body = submissionBody();
    expect((await postSubmission(t, f.code, body)).statusCode).toBe(201);
    for (let i = 1; i < 33; i++)
      expect((await postSubmission(t, f.code, submissionBody())).statusCode).toBe(201);
    expect((await postSubmission(t, f.code, submissionBody())).statusCode).toBe(429);
    expect((await postSubmission(t, f.code, body)).statusCode).toBe(201);
    expect(await storedSubmissions(f.rc.id)).toHaveLength(33);
  });
  it('per-IP limit uses last forwarded peer; replay consumes neither IP nor global quota', async () => {
    const f = await fresh(),
      body = submissionBody();
    t.app.get(QuotaService).limits.per_ip_per_10min = 1;
    expect((await postSubmission(t, f.code, body, '192.0.2.71')).statusCode).toBe(201);
    expect((await postSubmission(t, f.code, body, '192.0.2.71')).statusCode).toBe(201);
    expect((await postSubmission(t, f.code, submissionBody(), '192.0.2.71')).statusCode).toBe(429);
    expect((await postSubmission(t, f.code, submissionBody(), '192.0.2.72')).statusCode).toBe(201);
  });
  it('global cap covers all RoundClients and peers', async () => {
    const a = await fresh(),
      b = await fresh();
    const isolated = await submissionApp();
    try {
      isolated.app.get(QuotaService).limits.global_per_10min = 2;
      const body = submissionBody();
      expect((await postSubmission(isolated, a.code, body, '192.0.2.81')).statusCode).toBe(201);
      expect(
        (await postSubmission(isolated, b.code, submissionBody(), '192.0.2.82')).statusCode,
      ).toBe(201);
      expect(
        (await postSubmission(isolated, b.code, submissionBody(), '192.0.2.83')).statusCode,
      ).toBe(429);
      expect((await postSubmission(isolated, a.code, body, '192.0.2.81')).statusCode).toBe(201);
    } finally {
      await isolated.app.close();
    }
  });
  it('failed insert rolls back process quota reservation', async () => {
    const f = await fresh();
    t.app.get(QuotaService).limits.per_ip_per_10min = 1;
    const insert = vi
      .spyOn(t.app.get(PrivacyService).store, 'insertParts')
      .mockRejectedValueOnce(new Error('synthetic failure'));
    expect((await postSubmission(t, f.code, submissionBody(), '192.0.2.90')).statusCode).toBe(503);
    expect((await postSubmission(t, f.code, submissionBody(), '192.0.2.90')).statusCode).toBe(201);
    insert.mockRestore();
    expect(await storedSubmissions(f.rc.id)).toHaveLength(1);
  });
});
