import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { startApp, type TestApp } from '../support/auth-app.js';
import { runnerRound, removeRunnerRound } from '../support/runner-round.js';
import { auditWho } from '../../src/modules/auth/audit-who.js';

let t: TestApp, prisma: PrismaService, cookie: string;
let fixture: Awaited<ReturnType<typeof runnerRound>>;
const saved = { ...process.env },
  mark = `test.admin.${Date.now()}`,
  ids: string[] = [];
const call = (method: 'GET' | 'PATCH' | 'POST', url: string, payload?: object, auth = true) =>
  t.app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: auth ? { cookie: `varde_session=${encodeURIComponent(cookie)}` } : {},
    });
beforeAll(async () => {
  t = await startApp({});
  prisma = t.app.get(PrismaService);
  const session = await t.store.create({
    oid: mark,
    name: mark,
    via: 'entra',
    expiresAt: new Date(Date.now() + 3600_000),
  });
  cookie = t.app.getHttpAdapter().getInstance().signCookie(session.sid);
  fixture = await runnerRound(prisma, mark, 'draft');
  ids.push(fixture.round.id);
});
afterAll(async () => {
  for (const id of ids) await removeRunnerRound(prisma, id);
  await prisma.client.delete({ where: { id: fixture.client.id } });
  await prisma.auditLog.deleteMany({ where: { who: mark } });
  await t.app.close();
  process.env = saved;
});

describe('admin lists and employee count (1.24)', () => {
  it('every read and mutation requires an admin session', async () => {
    for (const url of [
      '/api/admin/clients',
      '/api/admin/rounds',
      '/api/admin/versions',
      '/api/admin/audit',
    ])
      expect((await call('GET', url, undefined, false)).statusCode).toBe(401);
    expect(
      (
        await call(
          'PATCH',
          `/api/admin/clients/${fixture.client.id}`,
          { employee_count: 20 },
          false,
        )
      ).statusCode,
    ).toBe(401);
  });
  it('lists expose metadata only, published versions only, never code or private rows', async () => {
    const rounds = await call('GET', '/api/admin/rounds');
    expect(rounds.statusCode).toBe(200);
    expect(rounds.json<unknown[]>()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: fixture.round.id })]),
    );
    expect(rounds.body).not.toMatch(/code|answers|respondent_key|session_id/);
    const clients = await call('GET', '/api/admin/clients');
    expect(clients.json<unknown[]>()).toContainEqual({
      id: fixture.client.id,
      name: mark,
      slug: fixture.client.slug,
      employee_count: null,
    });
    const draft = await prisma.templateVersion.create({
      data: {
        template_id: fixture.version.template_id,
        label: 'draft',
        version_no: 2,
        identification: 'none',
        required_languages: ['nn', 'en'],
        content: {},
        origin: 'authored',
        content_hash: '0'.repeat(64),
      },
    });
    const versions = await call('GET', '/api/admin/versions');
    expect(versions.body).toContain(fixture.version.id);
    expect(versions.body).not.toContain(draft.id);
    expect(versions.body).not.toContain('content');
  });
  it('rounds say whether they have answers, without leaking counts', async () => {
    const rounds = await call('GET', '/api/admin/rounds');
    expect(rounds.statusCode).toBe(200);
    const list = JSON.parse(rounds.body) as { has_data: boolean; round_clients: object[] }[];
    expect(list.length).toBeGreaterThan(0);
    for (const round of list) {
      expect(typeof round.has_data).toBe('boolean');
      for (const rc of round.round_clients) expect(rc).not.toHaveProperty('_count');
    }
  });
  it('employee edits affect future snapshots, preserve existing ones, and leave audit', async () => {
    expect(
      (await call('PATCH', `/api/admin/clients/${fixture.client.id}`, { employee_count: 20 }))
        .statusCode,
    ).toBe(200);
    const made = await call('POST', '/api/admin/rounds', {
      name: mark,
      template_version_id: fixture.version.id,
    });
    const id = made.json<{ id: string }>().id;
    ids.push(id);
    const added = await call('POST', `/api/admin/rounds/${id}/clients`, {
      client_id: fixture.client.id,
      deadline: '2099-06-01',
    });
    expect(added.statusCode).toBe(201);
    expect(added.json()).toMatchObject({ population_snapshot: 20 });
    expect(
      (await call('PATCH', `/api/admin/clients/${fixture.client.id}`, { employee_count: 30 }))
        .statusCode,
    ).toBe(200);
    expect(await prisma.roundClient.findUnique({ where: { id: fixture.rc.id } })).toMatchObject({
      population_snapshot: 12,
    });
    expect(
      await prisma.roundClient.findUnique({ where: { id: added.json<{ id: string }>().id } }),
    ).toMatchObject({ population_snapshot: 20 });
    expect(
      await prisma.auditLog.count({
        where: { who: mark, what: 'clients.update', target: `client:${fixture.client.id}` },
      }),
    ).toBe(2);
  });
  it('strict validation rejects extra fields, invalid counts and audit limits', async () => {
    for (const employee_count of [0, -1, 1.5, 10000, '12'])
      expect(
        (await call('PATCH', `/api/admin/clients/${fixture.client.id}`, { employee_count }))
          .statusCode,
      ).toBe(400);
    expect(
      (
        await call('PATCH', `/api/admin/clients/${fixture.client.id}`, {
          employee_count: 12,
          name: 'changed',
        })
      ).statusCode,
    ).toBe(400);
    for (const limit of ['0', '41', 'x', '1.5'])
      expect((await call('GET', `/api/admin/audit?limit=${limit}`)).statusCode).toBe(400);
  });
  it('audit projection omits details and respects the bounded limit', async () => {
    await prisma.auditLog.create({
      data: {
        who: mark,
        what: 'test.admin',
        target: 'synthetic',
        details: { private_marker: 'hidden' },
      },
    });
    const result = await call('GET', '/api/admin/audit?limit=1');
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual([
      { who: mark, what: 'test.admin', target: 'synthetic', at: expect.any(String) as unknown },
    ]);
    expect(result.body).not.toMatch(/details|private_marker|hidden/);
  });
  it('unknown population remains null in a new RoundClient', async () => {
    await call('PATCH', `/api/admin/clients/${fixture.client.id}`, { employee_count: null });
    const made = await call('POST', '/api/admin/rounds', {
      name: mark,
      template_version_id: fixture.version.id,
    });
    const id = made.json<{ id: string }>().id;
    ids.push(id);
    const added = await call('POST', `/api/admin/rounds/${id}/clients`, {
      client_id: fixture.client.id,
      deadline: '2099-06-01',
    });
    expect(added.statusCode).toBe(201);
    expect(added.json()).toMatchObject({ population_snapshot: null });
  });
  it('auditWho names the break-glass operator instead of the session ID', () => {
    expect(
      auditWho({ sid: 'opaque', oid: null, via: 'break_glass', name: 'break-glass:synthetic' }),
    ).toBe('break-glass:synthetic');
    expect(auditWho({ sid: 'opaque', oid: mark, via: 'entra', name: 'test' })).toBe(mark);
  });
});
