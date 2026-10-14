import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ProgressTtl, PROGRESS_TTL_JOB } from '../../src/jobs/progress-ttl.js';
import { JobsService } from '../../src/jobs/jobs.service.js';
import {
  cleanupSubmissions,
  postSubmission,
  submissionApp,
  submissionBody,
  submissionRound,
} from '../support/submissions.js';
import { withPg } from '../support/rounds.js';
import { until } from '../support/jobs-fixture.js';

let t: Awaited<ReturnType<typeof submissionApp>>, cookie: string;
const saved = { ...process.env },
  rounds: string[] = [];
beforeAll(async () => {
  t = await submissionApp();
  const session = await t.store.create({
    oid: 'test.progress',
    name: 'test',
    via: 'entra',
    expiresAt: new Date(Date.now() + 3600_000),
  });
  cookie = t.app.getHttpAdapter().getInstance().signCookie(session.sid);
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
const session = () => randomBytes(12).toString('hex');
const record = (code: string, body: object) =>
  t.app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method: 'POST',
      url: '/api/runner/progress',
      payload: body,
      headers: { authorization: `Bearer ${code}` },
    });
const get = (id: string, auth = true) =>
  t.app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method: 'GET',
      url: `/api/admin/rounds/${id}/progress`,
      headers: auth ? { cookie: `varde_session=${encodeURIComponent(cookie)}` } : {},
    });
type Cell = { suppressed: boolean; value?: number };
type View = {
  class: string;
  clients: {
    round_client_id: string;
    started: Cell;
    population_snapshot: number | null;
    responses_total: number;
    last_response_day: string | null;
    in_progress: Cell;
    abandoned: Cell;
    stopped: Record<string, Cell>;
    median_duration_s: Cell;
  }[];
};
async function aged(rc: string, minutes: number, question = 4, finished = false, id = session()) {
  await t.prisma.progressEvent.create({
    data: {
      round_client_id: rc,
      session_id: id,
      question_no: question,
      finished,
      at: new Date(Date.now() - minutes * 60_000),
    },
  });
  return id;
}

describe('live progress aggregates (1.20)', () => {
  it('requires admin session; bearer POST is strict, anonymous, returns 204', async () => {
    const f = await fresh(),
      id = session();
    expect((await get(f.round.id, false)).statusCode).toBe(401);
    expect((await record(f.code, { session_id: id, question_no: 1 })).statusCode).toBe(204);
    expect((await record(f.code, { session_id: id, question_no: 1, answers: {} })).statusCode).toBe(
      400,
    );
    expect((await record('', { session_id: id, question_no: 1 })).statusCode).toBe(403);
    expect((await record(f.code, { session_id: id, question_no: 999 })).statusCode).toBe(400);
    const res = await get(f.round.id);
    expect(res.json<View>().class).toBe('aggregate');
    expect(res.body).not.toContain('session_id');
    expect(res.body).not.toContain(id);
    expect(res.body).not.toContain('answers');
    expect(res.body).not.toContain('192.0.2');
    const columns = await withPg((c) =>
      c.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name='progress_event'",
      ),
    );
    expect(columns.rows.map((r) => r.column_name)).not.toContain('ip');
  });
  it('k hides small groups; stopped cell changes from two to three immediately without history', async () => {
    const f = await fresh();
    await aged(f.rc.id, 31);
    await aged(f.rc.id, 31);
    expect((await get(f.round.id)).json<View>().clients[0]).toMatchObject({
      started: { suppressed: true },
      abandoned: { suppressed: true },
      stopped: { '4': { suppressed: true } },
    });
    await aged(f.rc.id, 31);
    expect((await get(f.round.id)).json<View>().clients[0]).toMatchObject({
      started: { suppressed: false, value: 3 },
      abandoned: { suppressed: false, value: 3 },
      stopped: { '4': { suppressed: false, value: 3 } },
    });
  });
  it('uses last event; 30 minutes without activity is abandoned, finished sessions never are', async () => {
    const f = await fresh();
    for (let i = 0; i < 3; i++) {
      await aged(f.rc.id, 30);
      const id = await aged(f.rc.id, 60, 7, true);
      await aged(f.rc.id, 40, 7, false, id);
      const active = await aged(f.rc.id, 40);
      await aged(f.rc.id, 1, 8, false, active);
    }
    const c = (await get(f.round.id)).json<View>().clients[0]!;
    expect(c.abandoned).toEqual({ suppressed: false, value: 3 });
    expect(c.in_progress).toEqual({ suppressed: false, value: 3 });
    expect(c.stopped['4']).toEqual({ suppressed: false, value: 3 });
    expect(c.stopped['7']).toEqual({ suppressed: true });
    expect(c.stopped['8']).toEqual({ suppressed: true });
  });
  it('secondary suppression protects a lone small cell from subtraction', async () => {
    const f = await fresh();
    for (let i = 0; i < 3; i++) await aged(f.rc.id, 31, 4);
    await aged(f.rc.id, 31, 5);
    const c = (await get(f.round.id)).json<View>().clients[0]!;
    expect(c.abandoned).toEqual({ suppressed: false, value: 4 });
    expect(c.stopped['4']).toEqual({ suppressed: true });
    expect(c.stopped['5']).toEqual({ suppressed: true });
  });
  it('suppressed cell shape cannot disclose which conditional question a tiny group visited', async () => {
    const f = await fresh();
    const before = (await get(f.round.id)).json<View>().clients[0]!.stopped;
    await aged(f.rc.id, 31, 6);
    expect((await get(f.round.id)).json<View>().clients[0]!.stopped).toEqual(before);
  });
  it('TTL job removes older than 24h, retains boundary and never expires responses', async () => {
    const f = await fresh();
    const now = new Date();
    await t.prisma.progressEvent.createMany({
      data: [24 * 3600_000 + 1, 24 * 3600_000, 1000].map((age) => ({
        round_client_id: f.rc.id,
        session_id: session(),
        question_no: 1,
        at: new Date(now.getTime() - age),
      })),
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    try {
      await t.app.get(ProgressTtl).run();
    } finally {
      vi.useRealTimers();
    }
    expect(await t.prisma.progressEvent.count({ where: { round_client_id: f.rc.id } })).toBe(2);
    expect(t.app.get(JobsService).settings(PROGRESS_TTL_JOB)).toEqual({});
  });
  it('median duration is computed through privacy, only for common, under k', async () => {
    const f = await fresh();
    for (const duration_s of [10, 50])
      await postSubmission(t, f.code, { ...submissionBody(), duration_s });
    expect((await get(f.round.id)).json<View>().clients[0]!.median_duration_s).toEqual({
      suppressed: true,
    });
    await postSubmission(t, f.code, { ...submissionBody(), duration_s: 20 });
    expect((await get(f.round.id)).json<View>().clients[0]!.median_duration_s).toEqual({
      suppressed: false,
      value: 20,
    });
  });
  it('exact totals and last day are common only; unknown population stays null; even median is upper middle', async () => {
    const f = await fresh();
    await t.prisma.roundClient.update({
      where: { id: f.rc.id },
      data: { population_snapshot: null },
    });
    expect((await get(f.round.id)).json<View>().clients[0]).toMatchObject({
      responses_total: 0,
      last_response_day: null,
      population_snapshot: null,
    });
    for (const duration_s of [10, 20, 30, 40])
      expect(
        (await postSubmission(t, f.code, { ...submissionBody(), duration_s })).statusCode,
      ).toBe(201);
    expect(
      (
        await postSubmission(t, f.code, {
          ...submissionBody(),
          part: 'leader',
          role: f.content.leader_roles[0],
          duration_s: 900,
        })
      ).statusCode,
    ).toBe(201);
    const result = await get(f.round.id);
    expect(result.json<View>().clients[0]).toMatchObject({
      population_snapshot: null,
      responses_total: 4,
      last_response_day: new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z',
      median_duration_s: { suppressed: false, value: 30 },
    });
    expect(result.body).not.toMatch(/answers|respondent_key|session_id|submission_id/);
  });
  it('the live window excludes events older than 24 hours', async () => {
    const f = await fresh();
    for (let i = 0; i < 3; i++) await aged(f.rc.id, 24 * 60 + 1);
    expect((await get(f.round.id)).json<View>().clients[0]).toMatchObject({
      started: { suppressed: true },
      stopped: { '4': { suppressed: true } },
    });
  });
  it('per-session sliding limit returns 429, without persisting IP', async () => {
    const f = await fresh(),
      id = session();
    for (let i = 0; i < 300; i++)
      expect((await record(f.code, { session_id: id, question_no: 1 })).statusCode).toBe(204);
    expect((await record(f.code, { session_id: id, question_no: 1 })).statusCode).toBe(429);
  });
  it('pg-boss registers the TTL handler and persists an hourly schedule with reference-only payload', async () => {
    const jobs = t.app.get(JobsService);
    expect(await until(() => Promise.resolve(jobs.running), Boolean)).toBe(true);
    const result = await withPg((c) =>
      c.query<{ cron: string; data: Record<string, unknown> }>(
        'SELECT cron, data FROM pgboss.schedule WHERE name = $1',
        [PROGRESS_TTL_JOB],
      ),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.cron).toBe('0 * * * *');
    expect(Object.keys(result.rows[0]!.data)).toEqual(['id']);
  });
});
