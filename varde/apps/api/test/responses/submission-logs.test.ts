import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrivacyService } from '../../src/modules/privacy/privacy.service.js';
import { captureOutput } from '../support/capture-output.js';
import {
  cleanupSubmissions,
  postSubmission,
  submissionApp,
  submissionBody,
  submissionRound,
} from '../support/submissions.js';

let t: Awaited<ReturnType<typeof submissionApp>>;
const saved = { ...process.env },
  rounds: string[] = [];
beforeAll(async () => {
  t = await submissionApp();
});
afterAll(async () => {
  await cleanupSubmissions(t.prisma, rounds);
  await t.app.close();
  process.env = saved;
});
async function fresh() {
  const f = await submissionRound(t);
  rounds.push(f.round.id);
  return f;
}

describe('1b access-code and timestamp log invariants', () => {
  it('2xx runner page, metadata, progress, submission and replay leave no request log', async () => {
    const f = await fresh(),
      body = submissionBody();
    const out = captureOutput();
    try {
      const fastify = t.app.getHttpAdapter().getInstance();
      expect((await fastify.inject({ method: 'GET', url: `/r?c=${f.code}` })).statusCode).toBe(200);
      expect(
        (
          await fastify.inject({
            method: 'GET',
            url: '/api/runner/round',
            headers: { authorization: `Bearer ${f.code}` },
          })
        ).statusCode,
      ).toBe(200);
      expect((await postSubmission(t, f.code, body)).statusCode).toBe(201);
      expect((await postSubmission(t, f.code, body)).statusCode).toBe(201);
      expect(
        (
          await fastify.inject({
            method: 'POST',
            url: '/api/runner/progress',
            payload: { session_id: 'a'.repeat(24), question_no: 1 },
            headers: { authorization: `Bearer ${f.code}` },
          })
        ).statusCode,
      ).toBe(204);
      expect(out.lines().filter((l) => l.startsWith('{') && l.includes('"path"'))).toEqual([]);
      expect(out.text()).not.toContain(f.code);
      expect(out.text()).not.toContain('ZZTEST');
    } finally {
      out.restore();
    }
  });
  it('4xx query and bearer failures contain no code, IP, headers or identifiers', async () => {
    const f = await fresh(),
      body = submissionBody();
    await postSubmission(t, f.code, body);
    const out = captureOutput();
    try {
      const missing = await t.app
        .getHttpAdapter()
        .getInstance()
        .inject({ method: 'GET', url: `/r/missing?c=${f.code}` });
      expect(missing.statusCode).toBe(404);
      expect(missing.body).not.toContain(f.code);
      expect(
        (await postSubmission(t, f.code, { ...body, duration_s: 1 }, '192.0.2.123')).statusCode,
      ).toBe(409);
      expect(
        (await postSubmission(t, f.code, { ...body, respondent_key: 'ZZTEST' })).statusCode,
      ).toBe(400);
      await t.prisma.roundClient.update({ where: { id: f.rc.id }, data: { status: 'closed' } });
      expect((await postSubmission(t, f.code, submissionBody())).statusCode).toBe(410);
      for (const privateValue of [f.code, '?c=', 'Authorization', 'ZZTEST', '192.0.2.123'])
        expect(out.text()).not.toContain(privateValue);
      const lines = out
        .lines()
        .filter((l) => l.startsWith('{'))
        .map((l) => JSON.parse(l) as { status: number });
      expect(lines.map((l) => l.status)).toEqual([404, 409, 400, 410]);
    } finally {
      out.restore();
    }
  });
  it('database exceptions are sanitized before reaching the global exception logger', async () => {
    const f = await fresh(),
      out = captureOutput();
    const insert = vi
      .spyOn(t.app.get(PrivacyService).store, 'insertParts')
      .mockRejectedValueOnce(new Error(`synthetic DB arguments: ${f.code} ZZTEST`));
    try {
      const res = await postSubmission(t, f.code, submissionBody());
      expect(res.statusCode).toBe(503);
      for (const value of [out.text(), res.body]) {
        expect(value).not.toContain(f.code);
        expect(value).not.toContain('ZZTEST');
      }
    } finally {
      out.restore();
      insert.mockRestore();
    }
  });
});
