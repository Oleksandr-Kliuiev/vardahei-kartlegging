import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EventsService } from '../../src/modules/events/events.service.js';
import { SessionStore } from '../../src/modules/auth/session.store.js';
import {
  submissionApp,
  submissionRound,
  cleanupSubmissions,
  postSubmission,
  submissionBody,
} from '../support/submissions.js';
import { RoundsService } from '../../src/modules/rounds/rounds.service.js';

let t: Awaited<ReturnType<typeof submissionApp>>,
  cookie: string,
  origin: string,
  events: EventsService;
const saved = { ...process.env },
  rounds: string[] = [],
  controllers: AbortController[] = [];
beforeAll(async () => {
  t = await submissionApp();
  events = t.app.get(EventsService);
  const s = await t.store.create({
    oid: 'test.events',
    name: 'test',
    via: 'entra',
    expiresAt: new Date(Date.now() + 3600_000),
  });
  cookie = t.app.getHttpAdapter().getInstance().signCookie(s.sid);
  await t.app.listen(0, '127.0.0.1');
  origin = await t.app.getUrl();
});
afterAll(async () => {
  for (const controller of controllers) controller.abort();
  await cleanupSubmissions(t.prisma, rounds);
  await t.app.close();
  process.env = saved;
});
async function stream(session = cookie) {
  const controller = new AbortController();
  controllers.push(controller);
  const res = await fetch(`${origin}/api/admin/events`, {
    headers: { cookie: `varde_session=${encodeURIComponent(session)}` },
    signal: controller.signal,
  });
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  expect(res.headers.get('cache-control')).toBe('no-store');
  const reader = res.body!.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const initial = await reader.read();
  expect(new TextDecoder().decode(initial.value)).toContain('event: changed');
  return { controller, reader };
}
async function fresh() {
  const f = await submissionRound(t);
  rounds.push(f.round.id);
  return f;
}
describe('admin changed stream (1.25)', () => {
  it('only committed writes notify: an invalid request or idempotent replay does not refetch', async () => {
    const f = await fresh();
    const changed = vi.spyOn(events, 'changed');
    try {
      expect((await postSubmission(t, f.code, {})).statusCode).toBe(400);
      expect(changed).not.toHaveBeenCalled();
      const body = submissionBody();
      expect((await postSubmission(t, f.code, body)).statusCode).toBe(201);
      expect(changed.mock.calls).toEqual([['responses'], ['progress']]);
      changed.mockClear();
      expect((await postSubmission(t, f.code, body)).statusCode).toBe(201);
      expect(changed).not.toHaveBeenCalled();
      await expect(t.app.get(RoundsService).openClient(f.rc.id, 'test.events')).rejects.toThrow();
      expect(changed).not.toHaveBeenCalled();
    } finally {
      changed.mockRestore();
    }
  });
  it('without admin cookie (including a runner code) → 401', async () => {
    expect((await fetch(`${origin}/api/admin/events`)).status).toBe(401);
    const f = await fresh();
    expect(
      (
        await fetch(`${origin}/api/admin/events`, {
          headers: { authorization: `Bearer ${f.code}` },
        })
      ).status,
    ).toBe(401);
  });
  it('submission, progress and lifecycle notify both tabs with only a topic', async () => {
    const f = await fresh();
    await new Promise((r) => setTimeout(r, 350));
    const a = await stream(),
      b = await stream();
    expect(events.connections).toBe(2);
    const pendingA = a.reader.read(),
      pendingB = b.reader.read();
    const started = Date.now();
    expect((await postSubmission(t, f.code, submissionBody())).statusCode).toBe(201);
    expect(
      (
        await t.app
          .getHttpAdapter()
          .getInstance()
          .inject({
            method: 'POST',
            url: '/api/runner/progress',
            headers: { authorization: `Bearer ${f.code}` },
            payload: { session_id: randomBytes(12).toString('hex'), question_no: 2 },
          })
      ).statusCode,
    ).toBe(204);
    await t.app.get(RoundsService).setDeadline(f.rc.id, '2099-07-01', 'test.events');
    for (const chunk of await Promise.all([pendingA, pendingB])) {
      const body = new TextDecoder().decode(chunk.value);
      const payloads = body
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => JSON.parse(l.slice(6)) as { topic: string });
      expect(payloads.map((p) => p.topic).sort()).toEqual(['progress', 'responses', 'rounds']);
      for (const payload of payloads) expect(Object.keys(payload)).toEqual(['topic']);
      expect(body).not.toMatch(/answers|respondent_key|submission_id|session_id|test.events/);
      expect(body).not.toContain(f.code);
    }
    expect(Date.now() - started).toBeLessThan(2000);
    a.controller.abort();
    b.controller.abort();
  });
  it('debounces repeated topic and disconnect removes the listener; reconnect refetches', async () => {
    await new Promise((r) => setTimeout(r, 50));
    expect(events.connections).toBe(0);
    const s = await stream();
    const pending = s.reader.read();
    for (let i = 0; i < 10; i++) events.changed('progress');
    const body = new TextDecoder().decode((await pending).value);
    expect(body.match(/event: changed/g)).toHaveLength(1);
    expect(body).toContain('"topic":"progress"');
    s.controller.abort();
    await new Promise((r) => setTimeout(r, 50));
    expect(events.connections).toBe(0);
    const reconnected = await stream();
    expect(events.connections).toBe(1);
    reconnected.controller.abort();
  });
  it('session expiry ends an already authenticated stream', async () => {
    const s = await t.app.get(SessionStore).create({
      oid: 'test.expiry',
      name: 'test',
      via: 'entra',
      expiresAt: new Date(Date.now() + 500),
    });
    const opened = await stream(t.app.getHttpAdapter().getInstance().signCookie(s.sid));
    expect(await opened.reader.read()).toMatchObject({ done: true });
  });
});
