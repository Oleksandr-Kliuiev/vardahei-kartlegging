// Wave B: a client can be taken back out of a round, and a round nothing hangs on can be deleted.
// Both only while nothing is lost by it — the moment there is an answer, a started session or a
// released number, the round keeps what it has and the admin closes it instead.
import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedTemplatesService } from '../../src/modules/surveys/seed-templates.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { startApp, type TestApp } from '../support/auth-app.js';
import { SEED_DIR } from '../support/seed-dir.js';

let t: TestApp, prisma: PrismaService, cookie: string, version: string, client: string;
const mark = `test.remove.${Date.now()}`;
const saved = { ...process.env };
const rounds: string[] = [];
const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  t.app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method,
      url,
      ...(payload === undefined ? {} : { payload }),
      headers: { cookie: `__Host-varde_session=${encodeURIComponent(cookie)}` },
    });

beforeAll(async () => {
  t = await startApp({ SESSION_SECRET: randomBytes(32).toString('hex') });
  prisma = t.app.get(PrismaService);
  const session = await t.store.create({
    oid: mark,
    name: mark,
    via: 'entra',
    expiresAt: new Date(Date.now() + 3600_000),
  });
  cookie = t.app.getHttpAdapter().getInstance().signCookie(session.sid);
  await t.app.get(SeedTemplatesService).seedTemplates(SEED_DIR, mark);
  version = (
    await prisma.templateVersion.findFirstOrThrow({
      where: { template: { key: 'tryggleik' }, status: 'published' },
    })
  ).id;
  client = (
    await call('POST', '/api/admin/clients', { name: `${mark}-kunde`, employee_count: 5 })
  ).json<{ id: string }>().id;
});
afterAll(async () => {
  await prisma.progressEvent.deleteMany({ where: { round_client: { round_id: { in: rounds } } } });
  await prisma.roundClient.deleteMany({ where: { round_id: { in: rounds } } });
  await prisma.round.deleteMany({ where: { id: { in: rounds } } });
  await prisma.client.deleteMany({ where: { id: client } });
  await prisma.auditLog.deleteMany({ where: { who: mark } });
  await t.app.close();
  process.env = saved;
});

/** A fresh draft round with the one client in it. */
async function roundWithClient() {
  const round = (
    await call('POST', '/api/admin/rounds', {
      name: `${mark}-${randomUUID()}`,
      template_version_id: version,
    })
  ).json<{ id: string }>();
  rounds.push(round.id);
  const added = await call('POST', `/api/admin/rounds/${round.id}/clients`, {
    client_id: client,
    deadline: '2099-06-01',
  });
  expect(added.statusCode).toBe(201);
  return { round: round.id, rc: added.json<{ id: string }>().id };
}

describe('ta ein kunde ut av ei runde', () => {
  it('takes the client out while nothing is lost, and says so in the journal', async () => {
    const { round, rc } = await roundWithClient();
    expect((await call('DELETE', `/api/admin/round-clients/${rc}`)).statusCode).toBe(200);
    expect(await prisma.roundClient.count({ where: { round_id: round } })).toBe(0);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { who: mark, what: 'rounds.client.remove', target: `round:${round}` },
    });
    expect(audit.details).toEqual({ client: `${mark}-kunde` });
  });
  it('keeps a client that has started the survey', async () => {
    const { rc } = await roundWithClient();
    await prisma.progressEvent.create({
      data: { round_client_id: rc, session_id: randomUUID(), question_no: 1 },
    });
    const refused = await call('DELETE', `/api/admin/round-clients/${rc}`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json<{ message: string }>().message).toContain('svar eller aktivitet');
    expect(await prisma.roundClient.count({ where: { id: rc } })).toBe(1);
  });
  it('keeps everything once the round is closed', async () => {
    const { round, rc } = await roundWithClient();
    // The round leaves `draft` with its mode fixed (CHECK round_mode_fixed).
    await prisma.round.update({
      where: { id: round },
      data: { status: 'closed', identification: 'initials' },
    });
    // A round never goes back to `draft` (trigger round_freeze); it stays as it is for the cleanup.
    expect((await call('DELETE', `/api/admin/round-clients/${rc}`)).statusCode).toBe(409);
  });
});

describe('slette ei runde', () => {
  it('deletes a draft round nothing hangs on, and keeps one with clients', async () => {
    const { round, rc } = await roundWithClient();
    const withClients = await call('DELETE', `/api/admin/rounds/${round}`);
    expect(withClients.statusCode).toBe(409);
    expect(withClients.json<{ message: string }>().message).toContain('kundar');
    expect((await call('DELETE', `/api/admin/round-clients/${rc}`)).statusCode).toBe(200);
    expect((await call('DELETE', `/api/admin/rounds/${round}`)).statusCode).toBe(200);
    expect(await prisma.round.count({ where: { id: round } })).toBe(0);
    expect(
      await prisma.auditLog.count({ where: { who: mark, what: 'rounds.remove' } }),
    ).toBeGreaterThan(0);
  });
  it('keeps a round that has been opened', async () => {
    const { round, rc } = await roundWithClient();
    expect((await call('DELETE', `/api/admin/round-clients/${rc}`)).statusCode).toBe(200);
    await prisma.round.update({
      where: { id: round },
      data: { status: 'open', identification: 'initials' },
    });
    const refused = await call('DELETE', `/api/admin/rounds/${round}`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json<{ message: string }>().message).toContain('ikkje er opna');
  });
});

describe('arkivert kunde', () => {
  it('stays out of everything new until it is taken back', async () => {
    const round = (
      await call('POST', '/api/admin/rounds', {
        name: `${mark}-arkiv-${randomUUID()}`,
        template_version_id: version,
      })
    ).json<{ id: string }>();
    rounds.push(round.id);
    expect(
      (await call('PUT', `/api/admin/clients/${client}/archive`, { archived: true })).statusCode,
    ).toBe(200);
    const refused = await call('POST', `/api/admin/rounds/${round.id}/clients`, {
      client_id: client,
      deadline: '2099-06-01',
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json<{ message: string }>().message).toContain('arkivert');
    // The whole wizard refuses it too, not only «Legg til kunde».
    const launch = await call('POST', '/api/admin/rounds/launch', {
      name: `${mark}-launch-${randomUUID()}`,
      template_version_id: version,
      clients: [{ client_id: client, deadline: '2099-06-01' }],
    });
    expect(launch.statusCode).toBe(400);
    // Taken back, it works as before.
    expect(
      (await call('PUT', `/api/admin/clients/${client}/archive`, { archived: false })).statusCode,
    ).toBe(200);
    const added = await call('POST', `/api/admin/rounds/${round.id}/clients`, {
      client_id: client,
      deadline: '2099-06-01',
    });
    expect(added.statusCode).toBe(201);
    expect(
      (await call('DELETE', `/api/admin/round-clients/${added.json<{ id: string }>().id}`))
        .statusCode,
    ).toBe(200);
    for (const what of ['clients.archive', 'clients.unarchive'])
      expect(await prisma.auditLog.count({ where: { who: mark, what } })).toBe(1);
  });
});
