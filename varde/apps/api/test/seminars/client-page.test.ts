// 2.17 (integration): the client page. Contacts of one client: how many without names and without
// a log entry; names and e-mail only on request, through privacy, with AuditLog in the same
// transaction. The follow-up of its saved findings: per round the set computed last for the
// client, the newest status of any release of that round, the seminar and who changed it — no
// numbers of the finding.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EventsService } from '../../src/modules/events/events.service.js';
import { withPg } from '../support/rounds.js';
import {
  createSeminar,
  email,
  makeClients,
  register,
  seminarApp,
  type SeminarApp,
} from '../support/seminars.js';

let t: SeminarApp;
let clients: { id: string; name: string }[];
const rounds: string[] = [];

// Names come from the admin sessions in the database (the test app keeps its own in memory).
const named = { oid: 'test:seminar-admin', name: 'Syntetisk admin', via: 'entra' };

beforeAll(async () => {
  t = await seminarApp();
  clients = await makeClients(t, ['Syntetisk A', 'Syntetisk B', 'Syntetisk C']);
  await t.prisma.adminSession.create({
    data: { ...named, expires_at: new Date(Date.now() + 3600_000) },
  });
}, 120_000);
afterAll(async () => {
  // A finding takes its status with it; a finding set is never deleted (trigger) and names
  // only synthetic rounds. The seminars and clients go in close().
  await t.prisma.finding.deleteMany({ where: { round_id: { in: rounds } } });
  await t.prisma.adminSession.deleteMany({ where: named });
  await t.close();
});

const none = { cookie: '' };
const audits = () => t.prisma.auditLog.count({ where: { what: 'privacy.participants' } });

describe('contacts of one client (class rows of seminars, 2.17)', () => {
  it('counts without names or a log entry; names and e-mail on request with AuditLog, only this client', async () => {
    const [a, b] = clients;
    const s = await createSeminar(t, { clients: [a!.id, b!.id] });
    await register(t, s.id, email(t, 'a1'), {
      name: 'ZZ Ola Syntetisk',
      client: a!.id,
      company: a!.name,
    });
    await register(t, s.id, email(t, 'a2'), {
      name: 'ZZ Kari Syntetisk',
      client: a!.id,
      company: a!.name,
      invite: true,
    });
    await register(t, s.id, email(t, 'b1'), {
      name: 'ZZ Per Syntetisk',
      client: b!.id,
      company: b!.name,
    });
    await register(t, s.id, email(t, 'x1'), { name: 'ZZ Annan Syntetisk' });
    await withPg(async (c) => {
      await c.query(`UPDATE contact SET role_at_client = 'dagleg leiar' WHERE email = $1`, [
        email(t, 'a2'),
      ]);
      await c.query('UPDATE contact SET review_flagged_at = now() WHERE email = $1', [
        email(t, 'a1'),
      ]);
    });
    for (const url of [
      `/api/admin/clients/${a!.id}/contacts/count`,
      `/api/admin/clients/${a!.id}/contacts`,
      `/api/admin/clients/${a!.id}/finding-status`,
    ])
      expect((await t.call('GET', url, undefined, none)).statusCode, url).toBe(401);

    const before = await audits();
    const count = await t.call('GET', `/api/admin/clients/${a!.id}/contacts/count`);
    expect(count.statusCode).toBe(200);
    expect(count.json()).toEqual({ total: 2, review: 1 });
    expect(count.body).not.toMatch(/ZZ |@example\.test/);
    expect(await audits()).toBe(before);

    const res = await t.call('GET', `/api/admin/clients/${a!.id}/contacts`);
    expect(res.statusCode).toBe(200);
    const { rows } = res.json<{ rows: Record<string, unknown>[] }>();
    // By name: Kari before Ola.
    expect(rows).toEqual([
      {
        id: expect.any(String) as unknown,
        name: 'ZZ Kari Syntetisk',
        email: email(t, 'a2'),
        role: 'dagleg leiar',
        invite: true,
        last_confirmed_at: expect.any(String) as unknown,
        review: false,
        seminars: [
          { id: s.id, topic: `Passord og MFA ${t.mark}`, starts_at: '2099-11-05T08:00:00.000Z' },
        ],
      },
      expect.objectContaining({
        name: 'ZZ Ola Syntetisk',
        role: null,
        invite: false,
        review: true,
      }),
    ]);
    for (const other of ['ZZ Per Syntetisk', 'ZZ Annan Syntetisk', email(t, 'b1'), email(t, 'x1')])
      expect(res.body).not.toContain(other);
    expect(await audits()).toBe(before + 1);
    const entry = await t.prisma.auditLog.findFirstOrThrow({
      where: { what: 'privacy.participants' },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
    });
    expect(entry).toMatchObject({
      who: 'entra:test:seminar-admin',
      target: `client:${a!.id}`,
      details: { count: 2 },
    });
    expect(JSON.stringify(entry)).not.toMatch(/ZZ |@example\.test/);
  });

  it('a client without contacts reads zero (the read is still logged); unknown and technical clients are 404', async () => {
    const c = clients[2]!;
    expect((await t.call('GET', `/api/admin/clients/${c.id}/contacts/count`)).json()).toEqual({
      total: 0,
      review: 0,
    });
    const before = await audits();
    expect((await t.call('GET', `/api/admin/clients/${c.id}/contacts`)).json()).toEqual({
      rows: [],
    });
    expect(await audits()).toBe(before + 1);
    // The one technical client of live polls (3.4), made by the app when it is missing.
    const technical =
      (await t.prisma.client.findFirst({ where: { kind: 'seminar' } })) ??
      (await t.prisma.client.create({
        data: { slug: `${t.mark}-teknisk`, name: `ZZ teknisk ${t.mark}`, kind: 'seminar' },
      }));
    for (const id of [randomUUID(), technical.id])
      for (const path of ['contacts/count', 'contacts', 'finding-status']) {
        const r = await t.call('GET', `/api/admin/clients/${id}/${path}`);
        expect(r.statusCode, path).toBe(404);
        expect(r.json<{ message: string }>().message).toBe('Kunden finst ikkje.');
      }
    expect((await t.call('GET', '/api/admin/clients/ikkje-ein-id/contacts')).statusCode).toBe(400);
    expect(await audits()).toBe(before + 1);
  });
});

/** Saved findings of one release of a round for a scope, as `FindingsService.released` writes them. */
async function saveSet(
  round: string,
  scope: { client: string } | 'all',
  keys: string[],
  computed_at: Date,
) {
  const release = randomUUID();
  const client = scope === 'all' ? null : scope.client;
  await t.prisma.findingSet.create({
    data: {
      release_id: release,
      scope: client ?? 'all',
      round_id: round,
      rule_keys: keys.map((k) => `${k}@1`),
      computed_at,
    },
  });
  const ids: Record<string, string> = {};
  for (const key of keys)
    ids[key] = (
      await t.prisma.finding.create({
        data: {
          round_id: round,
          client_id: client,
          rule_key: key,
          rule_version: 1,
          numbers: { n: 9, count: 4, share: 4 / 9, level: 'high' },
          release_id: release,
        },
      })
    ).id;
  return ids;
}

describe('follow-up of the saved findings of one client (2.17)', () => {
  it('the current set of each round with the newest status of any release; no numbers; changes go to the current row', async () => {
    const [a, b] = clients;
    const round = randomUUID(),
      older = randomUUID();
    rounds.push(round, older);
    const hour = 3600_000,
      now = Date.now();
    const first = await saveSet(
      round,
      { client: a!.id },
      ['tryggleik.f12', 'tryggleik.f8'],
      new Date(now - 2 * hour),
    );
    // Other scopes of the same round, and an older round of the client, with their own sets.
    await saveSet(round, 'all', ['tryggleik.f12'], new Date(now - 2 * hour));
    await saveSet(round, { client: b!.id }, ['tryggleik.f12'], new Date(now - 2 * hour));
    const old = await saveSet(
      older,
      { client: a!.id },
      ['tryggleik.f5'],
      new Date(now - 48 * hour),
    );
    const s = await createSeminar(t, { clients: [a!.id] });
    const events = vi.spyOn(t.app.get(EventsService), 'changed');

    const list = async (id = a!.id) => {
      const res = await t.call('GET', `/api/admin/clients/${id}/finding-status`);
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toMatch(/numbers|share|"n"|"count"/);
      return res.json<{ rows: { id: string; round: string; rule_key: string; status: string }[] }>()
        .rows;
    };
    const start = await list();
    expect(start).toHaveLength(3);
    expect(start.find((r) => r.rule_key === 'tryggleik.f12')).toEqual({
      id: first['tryggleik.f12'],
      round,
      rule_key: 'tryggleik.f12',
      status: 'open',
      seminar: null,
      changed_by: null,
      changed_at: null,
    });
    expect(start).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: first['tryggleik.f8'],
          round,
          rule_key: 'tryggleik.f8',
          status: 'open',
        }),
        expect.objectContaining({
          id: old['tryggleik.f5'],
          round: older,
          rule_key: 'tryggleik.f5',
          status: 'open',
        }),
      ]),
    );

    const put = await t.call('PUT', `/api/admin/findings/${first['tryggleik.f12']}/status`, {
      status: 'in_seminar',
      seminar: s.id,
    });
    expect(put.statusCode).toBe(200);
    expect(events).toHaveBeenCalledWith('seminars');
    const taken = (await list()).find((r) => r.rule_key === 'tryggleik.f12');
    expect(taken).toEqual({
      id: first['tryggleik.f12'],
      round,
      rule_key: 'tryggleik.f12',
      status: 'in_seminar',
      seminar: {
        id: s.id,
        topic: `Passord og MFA ${t.mark}`,
        starts_at: '2099-11-05T08:00:00.000Z',
        held: false,
      },
      // The name the admin signed in with, as in the journal.
      changed_by: 'Syntetisk admin',
      changed_at: expect.any(String) as unknown,
    });

    // The round is released again: a new set with new rows. The work done stays, a new status
    // goes to the new row and wins by time.
    const second = await saveSet(
      round,
      { client: a!.id },
      ['tryggleik.f12', 'tryggleik.f8'],
      new Date(now - hour),
    );
    const again = await list();
    expect(again.filter((r) => r.round === round)).toEqual([
      expect.objectContaining({
        id: second['tryggleik.f12'],
        status: 'in_seminar',
        seminar: expect.objectContaining({ id: s.id }) as unknown,
      }),
      expect.objectContaining({ id: second['tryggleik.f8'], status: 'open' }),
    ]);
    const done = await t.call('PUT', `/api/admin/findings/${second['tryggleik.f12']}/status`, {
      status: 'closed',
      seminar: s.id,
    });
    expect(done.statusCode).toBe(200);
    expect((await list()).find((r) => r.rule_key === 'tryggleik.f12')).toMatchObject({
      id: second['tryggleik.f12'],
      status: 'closed',
      seminar: { id: s.id },
    });
    const reopened = await t.call('PUT', `/api/admin/findings/${second['tryggleik.f12']}/status`, {
      status: 'open',
    });
    expect(reopened.statusCode).toBe(200);
    expect((await list()).find((r) => r.rule_key === 'tryggleik.f12')).toMatchObject({
      status: 'open',
      seminar: null,
      changed_by: 'Syntetisk admin',
    });
    expect(
      await t.prisma.auditLog.count({
        where: {
          what: 'findings.status',
          target: {
            in: [`finding:${first['tryggleik.f12']}`, `finding:${second['tryggleik.f12']}`],
          },
        },
      }),
    ).toBe(3);
    // The other client sees only its own row; a client without saved findings has none.
    expect((await list(b!.id)).map((r) => r.rule_key)).toEqual(['tryggleik.f12']);
    expect(await list(clients[2]!.id)).toEqual([]);
    events.mockRestore();
  });
});
