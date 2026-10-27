import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MetricsService } from '../../src/modules/metrics/metrics.service.js';
import { SeedTemplatesService } from '../../src/modules/surveys/seed-templates.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { startApp, type TestApp } from '../support/auth-app.js';
import { withPg } from '../support/rounds.js';
import { runnerRound } from '../support/runner-round.js';
import { SEED_DIR } from '../support/seed-dir.js';

let t: TestApp;
let prisma: PrismaService;
let cookie: string;
let version: string;
let draftVersion: string;
let client: string;
const rounds: string[] = [];
const mark = `test.lifecycle.${Date.now()}`;
const saved = { ...process.env };
const call = (method: 'POST' | 'PATCH', url: string, payload?: object, authenticated = true) =>
  t.app.getHttpAdapter().getInstance().inject({ method, url, ...(payload === undefined ? {} : { payload }),
    headers: authenticated ? { cookie: `__Host-varde_session=${encodeURIComponent(cookie)}` } : {},
  });
const runner = (code: string) => t.app.getHttpAdapter().getInstance().inject({
  method: 'GET', url: '/api/runner/round', headers: { authorization: `Bearer ${code}` },
});

beforeAll(async () => {
  t = await startApp({ SESSION_SECRET: randomBytes(32).toString('hex') });
  prisma = t.app.get(PrismaService);
  const session = await t.store.create({ oid: mark, name: mark, via: 'entra', expiresAt: new Date(Date.now() + 3600_000) });
  cookie = t.app.getHttpAdapter().getInstance().signCookie(session.sid);
  await t.app.get(SeedTemplatesService).seedTemplates(SEED_DIR, mark);
  await t.app.get(MetricsService).seedMetrics(SEED_DIR);
  version = (await prisma.templateVersion.findFirstOrThrow({ where: { template: { key: 'tryggleik' }, status: 'published' } })).id;
  const fixture = await runnerRound(prisma, mark, 'draft');
  rounds.push(fixture.round.id);
  client = fixture.client.id;
  const draft = await prisma.templateVersion.create({ data: {
    template_id: fixture.version.template_id, version_no: 2, label: 'draft',
    identification: 'none', required_languages: ['nn', 'en'], content: {}, origin: 'authored', content_hash: '0'.repeat(64),
  } });
  draftVersion = draft.id;
});
afterAll(async () => {
  for (const id of rounds) {
    // Released snapshots are immutable: keep them in this disposable database, remove clients.
    await prisma.roundClient.deleteMany({ where: { round_id: id } });
    await prisma.round.delete({ where: { id } });
  }
  await prisma.auditLog.deleteMany({ where: { who: mark } });
  await t.app.close();
  process.env = saved;
});
async function fresh() {
  const created = await call('POST', '/api/admin/rounds', { name: mark, template_version_id: version });
  expect(created.statusCode).toBe(201);
  const round = created.json<{ id: string }>().id;
  rounds.push(round);
  const added = await call('POST', `/api/admin/rounds/${round}/clients`, { client_id: client, population_snapshot: 12, deadline: '2099-06-01' });
  expect(added.statusCode).toBe(201);
  return { round, rc: added.json<{ id: string }>().id };
}
const open = (id: string) => call('POST', `/api/admin/round-clients/${id}/open`);

describe('RoundClient lifecycle (1.19)', () => {
  it('without session all mutation routes → 401', async () => {
    const f = await fresh();
    for (const [method, url] of [
      ['POST', '/api/admin/rounds'], ['PATCH', `/api/admin/rounds/${f.round}`],
      ['POST', `/api/admin/rounds/${f.round}/clients`], ['POST', `/api/admin/rounds/${f.round}/close`],
      ['POST', `/api/admin/rounds/${f.round}/release`], ['POST', `/api/admin/round-clients/${f.rc}/open`],
      ['POST', `/api/admin/round-clients/${f.rc}/close`], ['POST', `/api/admin/round-clients/${f.rc}/reissue`],
      ['PATCH', `/api/admin/round-clients/${f.rc}/deadline`],
    ] as const) expect((await call(method, url, {}, false)).statusCode).toBe(401);
  });
  it('only published versions; input schema is strict', async () => {
    expect((await call('POST', '/api/admin/rounds', { name: mark, template_version_id: draftVersion })).statusCode).toBe(400);
    expect((await call('POST', '/api/admin/rounds', { name: mark, template_version_id: version, type: 'live' })).statusCode).toBe(400);
  });
  it('first open fixes version and identification; later version change is rejected', async () => {
    const f = await fresh();
    expect((await open(f.rc)).statusCode).toBe(201);
    expect(await prisma.round.findUnique({ where: { id: f.round } })).toMatchObject({
      template_version_id: version, identification: 'initials', status: 'open', opened_at: expect.any(Date) as unknown,
    });
    expect((await call('PATCH', `/api/admin/rounds/${f.round}`, { template_version_id: version })).statusCode).toBe(409);
  });
  it('closed client → runner 410', async () => {
    const f = await fresh();
    const code = (await open(f.rc)).json<{ code: string }>().code;
    expect((await call('POST', `/api/admin/round-clients/${f.rc}/close`)).statusCode).toBe(201);
    expect((await runner(code)).statusCode).toBe(410);
  });
  it('deadline in the past → runner 410; changing deadline updates expiry', async () => {
    const f = await fresh();
    const code = (await open(f.rc)).json<{ code: string }>().code;
    const res = await call('PATCH', `/api/admin/round-clients/${f.rc}/deadline`, { deadline: '2020-01-01' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ code_expires_at: '2020-01-01T23:00:00.000Z' });
    expect((await runner(code)).statusCode).toBe(410);
  });
  it('reissue → old 403, new 200', async () => {
    const f = await fresh();
    const old = (await open(f.rc)).json<{ code: string }>().code;
    const current = (await call('POST', `/api/admin/round-clients/${f.rc}/reissue`)).json<{ code: string }>().code;
    expect((await runner(old)).statusCode).toBe(403);
    expect((await runner(current)).statusCode).toBe(200);
  });
  it('closing round closes every client and creates released snapshots + auto audit', async () => {
    const f = await fresh();
    await open(f.rc);
    const res = await call('POST', `/api/admin/rounds/${f.round}/close`);
    expect(res.statusCode, res.body).toBe(201);
    expect(await prisma.roundClient.findUnique({ where: { id: f.rc } })).toMatchObject({ status: 'closed' });
    const count = await withPg((c) => c.query<{ n: string }>("SELECT count(*) AS n FROM aggregate_snapshot WHERE round_id = $1 AND status = 'released'", [f.round]));
    expect(Number(count.rows[0]!.n)).toBeGreaterThan(0);
    expect(await prisma.auditLog.count({ where: { who: 'system', what: 'privacy.release.auto', target: `round:${f.round}` } })).toBeGreaterThan(0);
    expect((await open(f.rc)).statusCode).toBe(409);
  });
  it('manual release uses privacy.release.manual', async () => {
    const f = await fresh();
    await open(f.rc);
    const res = await call('POST', `/api/admin/rounds/${f.round}/release`);
    expect(res.statusCode, res.body).toBe(201);
    expect(await prisma.auditLog.count({ where: { who: mark, what: 'privacy.release.manual', target: `round:${f.round}` } })).toBeGreaterThan(0);
  });
  it('each lifecycle action leaves its audit', async () => {
    const f = await fresh();
    await call('PATCH', `/api/admin/rounds/${f.round}`, { template_version_id: version });
    await open(f.rc);
    await call('PATCH', `/api/admin/round-clients/${f.rc}/deadline`, { deadline: '2099-07-01' });
    await call('POST', `/api/admin/round-clients/${f.rc}/reissue`);
    await call('POST', `/api/admin/round-clients/${f.rc}/close`);
    const rows = await prisma.auditLog.findMany({ where: { who: mark, target: { in: [`round:${f.round}`, `round_client:${f.rc}`] } } });
    expect(rows.map((r) => r.what)).toEqual(expect.arrayContaining([
      'rounds.create', 'rounds.version', 'rounds.client.add', 'rounds.client.open',
      'rounds.code.issue', 'rounds.code.reissue', 'rounds.client.deadline', 'rounds.client.close',
    ]));
  });
  it('concurrent opens issue one code and close cannot reopen the round', async () => {
    const f = await fresh();
    const results = await Promise.all([open(f.rc), open(f.rc)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(await prisma.auditLog.count({ where: { who: mark, what: 'rounds.code.issue', target: `round_client:${f.rc}` } })).toBe(1);
  });
});
