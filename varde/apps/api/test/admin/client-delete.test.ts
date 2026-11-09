// «Slett kunden»: only a client nothing refers to goes, with an entry in the log; anything tied to
// it — also the plain columns without a foreign key — refuses the deletion and changes nothing.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrivacyService } from '../../src/modules/privacy/privacy.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { startApp, type TestApp } from '../support/auth-app.js';
import { runnerRound, removeRunnerRound } from '../support/runner-round.js';

let t: TestApp, prisma: PrismaService, cookie: string;
let fixture: Awaited<ReturnType<typeof runnerRound>>;
const saved = { ...process.env },
  mark = `test.client-delete.${Date.now()}`;
const call = (method: 'GET' | 'DELETE', url: string, auth = true) =>
  t.app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method,
      url,
      headers: auth ? { cookie: `__Host-varde_session=${encodeURIComponent(cookie)}` } : {},
    });
const fresh = () =>
  prisma.client.create({ data: { name: `ZZ Dublett ${mark}`, slug: `kunde-${randomUUID()}` } });

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
});
afterAll(async () => {
  await removeRunnerRound(prisma, fixture.round.id);
  await prisma.client.delete({ where: { id: fixture.client.id } });
  await prisma.auditLog.deleteMany({ where: { who: mark } });
  await t.app.close();
  process.env = saved;
});

describe('deleting a client', () => {
  it('needs an admin session', async () => {
    const c = await fresh();
    expect((await call('DELETE', `/api/admin/clients/${c.id}`, false)).statusCode).toBe(401);
    expect((await call('GET', `/api/admin/clients/${c.id}/ties`, false)).statusCode).toBe(401);
    expect(await prisma.client.count({ where: { id: c.id } })).toBe(1);
    await prisma.client.delete({ where: { id: c.id } });
  });

  it('deletes a client with no ties and writes the log', async () => {
    const c = await fresh();
    expect((await call('GET', `/api/admin/clients/${c.id}/ties`)).json()).toEqual({
      rounds: 0,
      seminars: 0,
      interviews: 0,
      contacts: 0,
      history: 0,
    });
    expect((await call('DELETE', `/api/admin/clients/${c.id}`)).statusCode).toBe(200);
    expect(await prisma.client.count({ where: { id: c.id } })).toBe(0);
    expect(
      await prisma.auditLog.findFirst({
        where: { who: mark, what: 'clients.delete', target: `client:${c.id}` },
      }),
    ).toMatchObject({ details: { name: c.name } });
    expect((await call('DELETE', `/api/admin/clients/${c.id}`)).statusCode).toBe(404);
  });

  it('refuses a client in a round', async () => {
    const url = `/api/admin/clients/${fixture.client.id}`;
    expect((await call('GET', `${url}/ties`)).json()).toMatchObject({ rounds: 1 });
    expect((await call('DELETE', url)).statusCode).toBe(409);
    expect(await prisma.client.count({ where: { id: fixture.client.id } })).toBe(1);
  });

  it('refuses a client with a contact (the foreign key would only blank it)', async () => {
    const c = await fresh();
    const count = vi
      .spyOn(t.app.get(PrivacyService).participants, 'clientCount')
      .mockResolvedValue({ total: 1, review: 0 });
    expect((await call('DELETE', `/api/admin/clients/${c.id}`)).statusCode).toBe(409);
    expect(await prisma.client.count({ where: { id: c.id } })).toBe(1);
    count.mockRestore();
    await prisma.client.delete({ where: { id: c.id } });
  });

  it('refuses a client that only a column without a foreign key refers to', async () => {
    const c = await fresh();
    const request = await prisma.deletionRequest.create({
      data: { requested_by: mark, reason: mark, scope: 'client', scope_ref: {} },
    });
    const tomb = await prisma.deletionTombstone.create({
      data: {
        request_id: request.id,
        submission_id: randomUUID(),
        content_hash: 'x',
        round_id: randomUUID(),
        client_id: c.id,
        part: 'common',
      },
    });
    expect((await call('DELETE', `/api/admin/clients/${c.id}`)).statusCode).toBe(409);
    await prisma.deletionTombstone.delete({ where: { id: tomb.id } });
    await prisma.deletionRequest.delete({ where: { id: request.id } });
    await prisma.client.delete({ where: { id: c.id } });
  });

  it('never touches the technical client of live polls', async () => {
    const c = await prisma.client.findFirst({ where: { kind: { not: 'client' } } });
    if (!c) return;
    expect((await call('DELETE', `/api/admin/clients/${c.id}`)).statusCode).toBe(404);
  });
});
