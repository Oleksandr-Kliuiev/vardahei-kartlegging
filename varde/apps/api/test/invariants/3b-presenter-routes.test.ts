// 3b invariant (integration, ADR-008): the presenter key opens its own live poll and nothing else.
// Every registered route is called twice — with the key as a bearer and with no credentials at all.
// Only the presenter routes answer the key (and refuse everybody else with 401); on every other
// route the key changes nothing: the same status as without it, and on /api/* that is 401 or 403.
// The public POST routes get a valid body, so they reach their own check of the bearer.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { RouteOptions } from 'fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { seminarApp, type SeminarApp } from '../support/seminars.js';
import { answer, cleanupLive, livePoll, presenterKey, type LivePoll } from '../support/live.js';

let t: SeminarApp, p: LivePoll, other: LivePoll, key: string;
const routes: RouteOptions[] = [];
beforeAll(async () => {
  t = await seminarApp({}, (r) => {
    routes.push(r);
  });
  p = await livePoll(t);
  other = await livePoll(t);
  key = await presenterKey(t, p.seminar);
}, 120_000);
afterAll(async () => {
  await cleanupLive(t);
  await t.close();
});

const PRESENTER = new Set([
  'GET /api/presenter/poll',
  'POST /api/presenter/questions/:question/open',
  'POST /api/presenter/questions/:question/close',
  'POST /api/presenter/questions/:question/release',
]);
/** Long-lived streams: tested in test/live/stream.test.ts (key) and events/stream.test.ts (admin). */
const STREAMS = new Set(['GET /api/presenter/stream', 'GET /api/admin/events']);

function bodyOf(url: string): object | undefined {
  if (url === '/api/runner/submissions')
    return { submission_id: randomUUID(), part: 'common', lang: 'nn', answers: { L2: 'ja' } };
  if (url === '/api/runner/progress') return { session_id: 'a'.repeat(24), question_no: 1 };
  if (url === '/api/public/seminar/registrations')
    return {
      name: 'ZZ Walk',
      email: `zz-${t.mark}-walk@example.test`,
      company: { name: 'ZZ firma' },
      consent: 'pamelding-v1',
      lang: 'nn',
    };
  return undefined;
}

it('the key works on the presenter routes of its own poll only', async () => {
  const inject = (method: string, url: string, headers: Record<string, string>, payload?: object) =>
    t.app
      .getHttpAdapter()
      .getInstance()
      .inject({ method: method as 'GET', url, headers, ...(payload ? { payload } : {}) });
  const seen = new Set<string>();
  for (const route of routes) {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      if (method === 'HEAD' || method === 'OPTIONS') continue;
      const name = `${method} ${route.url}`;
      if (STREAMS.has(name)) continue;
      const url = route.url
        .replace(/:question\b/g, 'L2')
        .replace(/:key\b/g, 'tryggleik.f12')
        .replace(/:(id|clientId|registration|material|label)\b/g, () => p.seminar)
        .replace(/\*/g, 'x');
      const payload = bodyOf(url);
      const withKey = await inject(method, url, { authorization: `Bearer ${key}` }, payload);
      const without = await inject(
        method,
        url,
        {},
        payload && {
          ...payload,
          ...(url.includes('submissions') ? { submission_id: randomUUID() } : {}),
        },
      );
      seen.add(name);
      if (PRESENTER.has(name)) {
        expect(withKey.statusCode, name).toBe(200);
        expect(without.statusCode, name).toBe(401);
        continue;
      }
      expect(withKey.statusCode, `${name} (key vs nothing)`).toBe(without.statusCode);
      if (route.url.startsWith('/api/')) expect([401, 403], name).toContain(withKey.statusCode);
    }
  }
  for (const name of [
    ...PRESENTER,
    'GET /api/admin/seminars/:id/live',
    'POST /api/admin/seminars/:id/presenter',
    'GET /api/runner/live',
    'POST /api/runner/submissions',
    'GET /api/public/seminar',
  ])
    expect(seen, name).toContain(name);
  expect(seen.size).toBeGreaterThan(60);
  // The walk opened, closed and showed L2 of its own poll; the other seminar's poll did not move.
  const states = async (round: string) =>
    (await t.prisma.livePollQuestion.findMany({ where: { round_id: round } })).map((q) => q.state);
  expect(await states(p.round)).toContain('released');
  expect((await states(other.round)).every((s) => s === 'waiting')).toBe(true);
  // A phone of the other poll cannot answer through this one either.
  expect((await answer(t, other.code, 'L2', 'ja')).statusCode).toBe(409);
});
