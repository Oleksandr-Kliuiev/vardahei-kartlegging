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
  ids: string[] = [],
  /** Clients this file makes itself (wave A): removed in the same order they were added. */
  kundeIds: string[] = [];
const call = (method: 'GET' | 'PATCH' | 'POST', url: string, payload?: object, auth = true) =>
  t.app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: auth ? { cookie: `__Host-varde_session=${encodeURIComponent(cookie)}` } : {},
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
  await prisma.client.deleteMany({ where: { id: { in: kundeIds } } });
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
      expect.arrayContaining([
        // When it was made, opened and closed: «I dag» and the round page read them (2.17).
        expect.objectContaining({
          id: fixture.round.id,
          created_at: expect.any(String) as unknown,
          opened_at: null,
          closed_at: null,
        }),
      ]),
    );
    expect(rounds.body).not.toMatch(/code|answers|respondent_key|session_id/);
    const clients = await call('GET', '/api/admin/clients');
    expect(clients.json<unknown[]>()).toContainEqual({
      id: fixture.client.id,
      name: mark,
      slug: fixture.client.slug,
      employee_count: null,
      tags: [],
      archived_at: null,
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
    // The survey's title, so the wizard names a version by what people read (2.17).
    expect(
      versions
        .json<{ id: string; title: string | null }[]>()
        .find((v) => v.id === fixture.version.id),
    ).toHaveProperty('title');
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
  it('tags are kept lower case and without doubles, and are left alone when not sent', async () => {
    const made = await call('POST', '/api/admin/clients', {
      name: `${mark}-merkelapp`,
      employee_count: 5,
      tags: ['IT', ' it ', 'BIO'],
    });
    expect(made.statusCode).toBe(201);
    const client = made.json<{ id: string; tags: string[] }>();
    expect(client.tags).toEqual(['it', 'bio']);
    kundeIds.push(client.id);
    // A head count on its own says nothing about the tags, so they stay.
    expect(
      (await call('PATCH', `/api/admin/clients/${client.id}`, { employee_count: 6 })).statusCode,
    ).toBe(200);
    expect((await prisma.client.findUnique({ where: { id: client.id } }))?.tags).toEqual([
      'it',
      'bio',
    ]);
    // An empty list is a choice, and clears them.
    const cleared = await call('POST', '/api/admin/clients', { name: '', employee_count: null });
    expect(cleared.statusCode).toBe(400);
    for (const tags of [['a'.repeat(25)], ['', 'it'], ['a', 'b', 'c', 'd', 'e', 'f', 'g']])
      expect(
        (await call('POST', '/api/admin/clients', { name: `${mark}-x`, employee_count: null, tags }))
          .statusCode,
      ).toBe(400);
  });
  it('«Legg til fleire kundar» adds the new ones and leaves the names that are clients already', async () => {
    const first = `${mark}-bolk-1`,
      second = `${mark}-bolk-2`;
    const made = await call('POST', '/api/admin/clients/batch', {
      clients: [
        { name: first, employee_count: 12, tags: ['bio'] },
        { name: second, employee_count: null, tags: [] },
      ],
    });
    expect(made.statusCode).toBe(201);
    const { created } = made.json<{ created: { id: string; name: string }[]; skipped: string[] }>();
    expect(created.map((c) => c.name)).toEqual([first, second]);
    for (const c of created) kundeIds.push(c.id);
    expect((await prisma.client.findUnique({ where: { id: created[0]!.id } }))?.tags).toEqual([
      'bio',
    ]);
    expect(
      await prisma.auditLog.count({
        where: { who: mark, what: 'clients.create', target: `client:${created[0]!.id}` },
      }),
    ).toBe(1);
    // Running the same list again adds nothing twice, whatever the case of the names.
    const again = await call('POST', '/api/admin/clients/batch', {
      clients: [
        { name: first.toUpperCase(), employee_count: null, tags: [] },
        { name: `${mark}-bolk-3`, employee_count: null, tags: [] },
      ],
    });
    const twice = again.json<{ created: { id: string }[]; skipped: string[] }>();
    expect(twice.skipped).toEqual([first.toUpperCase()]);
    expect(twice.created).toHaveLength(1);
    kundeIds.push(twice.created[0]!.id);
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
    for (const limit of ['0', '201', 'x', '1.5'])
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
      {
        who: mark,
        who_name: mark,
        what: 'test.admin',
        target: 'synthetic',
        at: expect.any(String) as unknown,
      },
    ]);
    expect(result.body).not.toMatch(/details|private_marker|hidden/);
  });
  it('the journal of one round keeps its own entries and its clients (2.17)', async () => {
    const made = await call('POST', '/api/admin/rounds', {
      name: `${mark}-journal`,
      template_version_id: fixture.version.id,
    });
    const id = made.json<{ id: string }>().id;
    ids.push(id);
    const added = await call('POST', `/api/admin/rounds/${id}/clients`, {
      client_id: fixture.client.id,
      deadline: '2099-06-01',
    });
    const rc = added.json<{ id: string }>().id;
    await prisma.auditLog.create({ data: { who: mark, what: 'test.other', target: 'synthetic' } });
    const result = await call('GET', `/api/admin/audit?round=${id}&limit=200`);
    expect(result.statusCode).toBe(200);
    const rows = result.json<{ what: string; target: string }[]>();
    expect(rows.map((r) => r.target).sort()).toEqual([`round:${id}`, `round_client:${rc}`]);
    expect(rows.map((r) => r.what).sort()).toEqual(['rounds.client.add', 'rounds.create']);
    expect((await call('GET', '/api/admin/audit?round=x')).statusCode).toBe(400);
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
