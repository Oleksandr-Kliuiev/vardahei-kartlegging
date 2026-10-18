import 'reflect-metadata';
import type { RouteOptions } from 'fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { dashboardFixture, type DashboardFixture } from '../dashboard/fixture.js';
import { cookieHeader } from '../support/auth-app.js';
import { fixtureText } from '../support/fixtures.js';
import { withPg } from '../support/rounds.js';

let f: DashboardFixture;
const routes: RouteOptions[] = [];
const initials = [
  ...new Set(
    fixtureText('svar.synthetic.jsonl')
      .trim()
      .split('\n')
      .flatMap((line) => {
        const r = JSON.parse(line) as { svar?: { F1?: string; K0?: string } };
        return [r.svar?.F1, r.svar?.K0].filter((s): s is string => !!s);
      }),
  ),
];
beforeAll(async () => {
  f = await dashboardFixture((r) => {
    routes.push(r);
  });
}, 180_000);
afterAll(async () => {
  await f.close();
});
const rowClass = (url: string) =>
  url.startsWith('/api/admin/rows/') ||
  /\/exports\/(rows|analyse|analyse-personar)\.csv$/.test(url) ||
  /\/clients\/[^/]+\/leader-answers$/.test(url) ||
  /\/handover\//.test(url);
// A walk calls every route, round releases included: about 35 s on a quiet machine, 75-90 s on a
// busy one (18.10), past the 60 s default.
const ROUTE_WALK = 180_000;
it('walks actual registered API routes; only named row channels can release identifiers or answers', async () => {
  const client = await f.prisma.client.findUniqueOrThrow({ where: { slug: 'daco' } });
  const rc = await f.prisma.roundClient.findFirstOrThrow({
    where: { round_id: f.tryggleik, client_id: client.id },
  });
  const tested = new Set<string>();
  for (const route of routes) {
    if (!route.url.startsWith('/api/') || route.url === '/api/admin/events') continue;
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      if (method === 'HEAD' || method === 'OPTIONS') continue;
      let url = route.url
        .replace(/:clientId\b/g, client.id)
        .replace(
          /:id\b/g,
          route.url.includes('round-clients')
            ? rc.id
            : route.url.includes('/clients')
              ? client.id
              : f.tryggleik,
        );
      if (
        url.includes('/dashboard') ||
        url.includes('/rows/') ||
        url.includes('leader-answers') ||
        url.includes('/exports/')
      ) {
        url += '?round=' + f.tryggleik;
        if (url.includes('client.csv')) url += '&client=' + client.id;
      }
      const result = await f.app
        .getHttpAdapter()
        .getInstance()
        .inject({ method, url, headers: { cookie: cookieHeader(f.cookie) } });
      tested.add(method + ' ' + route.url);
      if (
        method === 'GET' &&
        (/\/exports\//.test(route.url) ||
          route.url === '/api/admin/dashboard' ||
          route.url === '/api/admin/rows/per-employee')
      )
        expect(result.statusCode, route.url).toBe(200);
      if (rowClass(route.url)) continue;
      expect(result.body, method + ' ' + route.url).not.toMatch(/"(?:answers|respondent_key)"\s*:/);
      for (const key of initials) expect(result.body, method + ' ' + route.url).not.toContain(key);
    }
  }
  expect(tested.size).toBeGreaterThan(25);
  expect(tested).toContain('GET /api/admin/exports/client.csv');
  expect(tested).toContain('POST /api/admin/retention/forget');
  // SSE carries only topics; unauthenticated stream is bounded and returns no data.
  expect((await f.get('/api/admin/events')).statusCode).toBe(401);
}, ROUTE_WALK);
it('client CSV never contains leader cells; anonymous rows never contain identifiers', async () => {
  const client = await f.get(
    `/api/admin/exports/client.csv?round=${f.tryggleik}&client=daco`,
    f.cookie,
  );
  expect(client.statusCode).toBe(200);
  expect(client.body).not.toMatch(/leaders_all|\.leiar_|respondent_key|submission_id/);
  const anon = await f.get(`/api/admin/exports/rows.csv?round=${f.anon}`, f.cookie);
  expect(anon.statusCode).toBe(200);
  expect(anon.body).not.toContain('respondent_key');
  for (const key of initials) expect(anon.body).not.toContain(key);
  expect((await f.get(`/api/admin/rows/per-employee?round=${f.anon}`, f.cookie)).statusCode).toBe(
    404,
  );
});
it('all existing export routes reject non-admin sessions', async () => {
  for (const route of routes.filter((r) => r.url.startsWith('/api/admin/exports/')))
    expect((await f.get(route.url + '?round=' + f.tryggleik)).statusCode).toBe(401);
});
it('live progress has no history of issue; snapshots have neither raw rows nor leader client cells', async () => {
  const before = await f.prisma.auditLog.count({
    where: { what: { startsWith: 'privacy.release.' } },
  });
  const r = await f.get(`/api/admin/rounds/${f.tryggleik}/progress`, f.cookie);
  expect(r.statusCode).toBe(200);
  expect(
    await f.prisma.auditLog.count({ where: { what: { startsWith: 'privacy.release.' } } }),
  ).toBe(before);
  const snapshots = await withPg(
    async (c) =>
      (
        await c.query<{ population: string; metric_key: string; payload: unknown }>(
          'SELECT population,metric_key,row_to_json(s) payload FROM aggregate_snapshot s WHERE round_id=$1',
          [f.tryggleik],
        )
      ).rows,
  );
  for (const s of snapshots) {
    expect(JSON.stringify(s.payload)).not.toMatch(/answers|respondent_key/);
    if (s.metric_key.includes('.leiar_')) expect(s.population).toBe('leaders_all');
  }
});
