// 3.1 (integration): seminar entities, the admin API, FindingStatus on attaching a finding,
// FindingRule → Action by key, and the invariant «Response never refers to Contact or
// Registration» (ADR-021) next to the constraints of the new tables.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FindingsService } from '../../src/modules/findings/findings.service.js';
import { osloInstant } from '../../src/modules/seminars/when.js';
import { withPg } from '../support/rounds.js';
import { SEED_DIR } from '../support/seed-dir.js';
import {
  createSeminar,
  email,
  makeClients,
  PUBLIC_URL,
  register,
  seminarApp,
  seminarBody,
  type SeminarApp,
} from '../support/seminars.js';

let t: SeminarApp;
let clients: { id: string; name: string }[];
const findings: string[] = [];
const actions: string[] = [];

beforeAll(async () => {
  t = await seminarApp();
  clients = await makeClients(t);
  await t.app.get(FindingsService).seed(SEED_DIR);
}, 120_000);
afterAll(async () => {
  await t.prisma.findingRuleAction.deleteMany({ where: { action_id: { in: actions } } });
  await t.prisma.action.deleteMany({ where: { id: { in: actions } } });
  await t.prisma.finding.deleteMany({ where: { id: { in: findings } } });
  await t.close();
});

const fks = (table: string) =>
  withPg(
    async (c) =>
      (
        await c.query<{ ref: string }>(
          `SELECT ccu.table_name AS ref FROM information_schema.table_constraints tc
             JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
            WHERE tc.table_name = $1 AND tc.constraint_type = 'FOREIGN KEY' ORDER BY 1`,
          [table],
        )
      ).rows.map((r) => r.ref),
  );
const columns = (table: string) =>
  withPg(
    async (c) =>
      (
        await c.query<{ column_name: string }>(
          'SELECT column_name FROM information_schema.columns WHERE table_name = $1',
          [table],
        )
      ).rows.map((r) => r.column_name),
  );

describe('ADR-021: Response never refers to Contact or Registration', () => {
  it('response has one FK (round_client) and no column naming a person, seminar or registration', async () => {
    expect(await fks('response')).toEqual(['round_client']);
    for (const col of await columns('response'))
      expect(col).not.toMatch(/contact|registration|seminar|email|name/);
  });
  it('contact and registration do not point at responses or round clients either', async () => {
    expect(await fks('contact')).toEqual(['client']);
    expect(await fks('registration')).toEqual(['contact', 'seminar']);
    for (const table of ['contact', 'registration'])
      for (const col of await columns(table)) expect(col).not.toMatch(/response|submission|round/);
  });
});

describe('admin API (3.1)', () => {
  it('without a session every seminar route is 401', async () => {
    const none = { cookie: '' };
    expect((await t.call('GET', '/api/admin/seminars', undefined, none)).statusCode).toBe(401);
    expect(
      (await t.call('POST', '/api/admin/seminars', seminarBody(t), none)).statusCode,
    ).toBe(401);
  });

  it('creates a seminar with an unguessable code, Oslo times, link and AuditLog without the code', async () => {
    const s = await createSeminar(t, { clients: clients.map((c) => c.id) });
    expect(s.code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const row = await t.prisma.seminar.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.starts_at.toISOString()).toBe('2099-11-05T08:00:00.000Z');
    expect(row.ends_at.toISOString()).toBe('2099-11-05T10:30:00.000Z');
    const view = (await t.call('GET', `/api/admin/seminars/${s.id}`)).json<Record<string, unknown>>();
    expect(view).toMatchObject({
      date: '2099-11-05',
      start: '09:00',
      end: '11:30',
      when: 'torsdag 5. november 2099, kl. 09.00–11.30',
      status: 'planned',
      languages: ['nn', 'en'],
      link: `${PUBLIC_URL}/s?c=${s.code}`,
      registrations: { total: 0, companies: [], other: 0 },
    });
    expect((view.clients as { name: string }[]).map((c) => c.name)).toEqual(
      clients.map((c) => c.name).sort(),
    );
    const audit = await t.prisma.auditLog.findFirstOrThrow({
      where: { what: 'seminars.create', target: `seminar:${s.id}` },
    });
    expect(JSON.stringify(audit)).not.toContain(s.code);
  });

  it('summer time: the same wall-clock time is another instant', () => {
    expect(osloInstant('2099-06-10', '09:00').toISOString()).toBe('2099-06-10T07:00:00.000Z');
    expect(osloInstant('2026-03-29', '12:00').toISOString()).toBe('2026-03-29T10:00:00.000Z');
    expect(osloInstant('2026-10-25', '12:00').toISOString()).toBe('2026-10-25T11:00:00.000Z');
  });

  it('rejects wrong input with a message in nynorsk; English needs an English topic', async () => {
    const bad = async (over: Record<string, unknown>) =>
      t.call('POST', '/api/admin/seminars', { ...seminarBody(t), ...over });
    const end = await bad({ start: '12:00', end: '11:00' });
    expect(end.statusCode).toBe(400);
    expect(end.json<{ message: string }>().message).toBe('Seminaret må slutte etter at det byrjar.');
    const en = await bad({ topic_en: '' });
    expect(en.json<{ message: string }>().message).toBe(
      'Skriv temaet på engelsk òg, eller ta bort engelsk.',
    );
    expect((await bad({ format: 'hybrid' })).statusCode).toBe(400);
    expect((await bad({ clients: [randomUUID()] })).statusCode).toBe(400);
    expect((await bad({ place: 'a\u0007b' })).statusCode).toBe(400);
    expect((await bad({ extra: 1 })).statusCode).toBe(400);
  });

  it('a change of time grows the sequence; clients are replaced; nn alone is fine', async () => {
    const s = await createSeminar(t, { clients: [clients[0]!.id] });
    const put = (over: Record<string, unknown>) =>
      t.call('PUT', `/api/admin/seminars/${s.id}`, { ...seminarBody(t), ...over });
    expect((await put({ clients: [clients[0]!.id] })).statusCode).toBe(200);
    expect((await t.prisma.seminar.findUniqueOrThrow({ where: { id: s.id } })).sequence).toBe(0);
    expect((await put({ start: '10:00', clients: [clients[1]!.id] })).statusCode).toBe(200);
    const row = await t.prisma.seminar.findUniqueOrThrow({
      where: { id: s.id },
      include: { clients: true },
    });
    expect(row.sequence).toBe(1);
    expect(row.clients.map((c) => c.client_id)).toEqual([clients[1]!.id]);
    expect(
      (await put({ languages: ['nn'], topic_en: undefined, clients: [] })).statusCode,
    ).toBe(200);
    expect((await t.call('PUT', `/api/admin/seminars/${randomUUID()}`, seminarBody(t))).statusCode).toBe(404);
  });

  it('the list counts registrations per company, without names, and puts coming seminars first', async () => {
    const past = await createSeminar(t, { date: '2020-01-10' });
    const next = await createSeminar(t, { clients: clients.map((c) => c.id) });
    await register(t, next.id, email(t, 'list-1'), { company: clients[0]!.name, client: clients[0]!.id });
    await register(t, next.id, email(t, 'list-2'), { company: clients[0]!.name, client: clients[0]!.id });
    await register(t, next.id, email(t, 'list-3'), { company: 'Eige firma' });
    const res = await t.call('GET', '/api/admin/seminars');
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      seminars: { id: string; status: string; registrations: { total: number; companies: unknown[] } }[];
    }>();
    const mine = body.seminars.filter((s) => [past.id, next.id].includes(s.id));
    expect(mine.map((s) => s.id)).toEqual([next.id, past.id]);
    // A company typed by a participant is counted as «other»: only the audited list shows it.
    expect(mine[0]!.registrations).toEqual({
      total: 3,
      companies: [{ company: clients[0]!.name, n: 2 }],
      other: 1,
    });
    expect(res.body).not.toContain('Eige firma');
    expect(mine[1]!.status).toBe('held');
    expect(res.body).not.toContain('ZZ Deltakar');
    expect(res.body).not.toContain(email(t, 'list-1'));
  });
});

describe('database constraints (3.1)', () => {
  it('rejects a bad format, languages without nn, a non-normalized e-mail and in_seminar without a seminar', async () => {
    const s = await createSeminar(t);
    await withPg(async (c) => {
      await expect(c.query(`UPDATE seminar SET format = 'hybrid' WHERE id = $1`, [s.id])).rejects.toThrow(
        /seminar_format_check/,
      );
      await expect(
        c.query(`UPDATE seminar SET required_languages = '{en}' WHERE id = $1`, [s.id]),
      ).rejects.toThrow(/seminar_languages_check/);
      await expect(
        c.query(
          `INSERT INTO contact (name, email, company) VALUES ('ZZ', 'ZZ@Example.test', 'x')`,
        ),
      ).rejects.toThrow(/contact_email_check/);
      const f = await t.prisma.finding.create({
        data: { round_id: randomUUID(), rule_key: 'zz.rule', rule_version: 1, numbers: {}, release_id: randomUUID() },
      });
      findings.push(f.id);
      await expect(
        c.query(
          `INSERT INTO finding_status (finding_id, status, changed_by) VALUES ($1, 'in_seminar', 'test')`,
          [f.id],
        ),
      ).rejects.toThrow(/finding_status_seminar_check/);
    });
  });
});

describe('FindingStatus (3.1 acceptance: attaching a finding to a seminar changes its status)', () => {
  it('open → in_seminar on attach (AuditLog), visible on the seminar; open again; closed keeps the seminar', async () => {
    const s = await createSeminar(t);
    const f = await t.prisma.finding.create({
      data: { round_id: randomUUID(), rule_key: 'tryggleik.f12', rule_version: 1, numbers: { n: 9 }, release_id: randomUUID() },
    });
    findings.push(f.id);
    expect(await t.prisma.findingStatus.findUnique({ where: { finding_id: f.id } })).toBeNull();
    const attach = await t.call('POST', `/api/admin/seminars/${s.id}/findings`, { findings: [f.id] });
    expect(attach.statusCode).toBe(201);
    expect(await t.prisma.findingStatus.findUniqueOrThrow({ where: { finding_id: f.id } })).toMatchObject({
      status: 'in_seminar',
      seminar_id: s.id,
      changed_by: 'entra:test:seminar-admin',
    });
    const view = (await t.call('GET', `/api/admin/seminars/${s.id}`)).json<{ findings: { id: string; status: string; rule_key: string }[] }>();
    expect(view.findings).toEqual([expect.objectContaining({ id: f.id, status: 'in_seminar', rule_key: 'tryggleik.f12' })]);
    expect(
      await t.prisma.auditLog.count({ where: { what: 'findings.status', target: `finding:${f.id}` } }),
    ).toBe(1);
    const open = await t.call('PUT', `/api/admin/findings/${f.id}/status`, { status: 'open' });
    expect(open.json()).toMatchObject({ status: 'open', seminar: null });
    const closed = await t.call('PUT', `/api/admin/findings/${f.id}/status`, { status: 'closed', seminar: s.id });
    expect(closed.json()).toMatchObject({ status: 'closed', seminar: s.id });
    expect(
      (await t.call('PUT', `/api/admin/findings/${f.id}/status`, { status: 'in_seminar' })).statusCode,
    ).toBe(400);
    expect(
      (await t.call('PUT', `/api/admin/findings/${randomUUID()}/status`, { status: 'open' })).statusCode,
    ).toBe(404);
    expect(
      (await t.call('POST', `/api/admin/seminars/${randomUUID()}/findings`, { findings: [f.id] })).statusCode,
    ).toBe(404);
  });
});

describe('FindingRule → Action by rule key (3.1)', () => {
  it('links every version of a rule without writing a rule version; null removes the link', async () => {
    const created = await t.call('POST', '/api/admin/actions', {
      name: `Kurs i passord ${t.mark}`,
      description: 'Eit kort kurs om passordhandsamar.',
      seminar_topic: 'Passord som fungerer',
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json<{ id: string }>();
    actions.push(id);
    const versions = await t.prisma.findingRule.count({ where: { key: 'tryggleik.f12' } });
    const link = await t.call('PUT', '/api/admin/finding-rules/tryggleik.f12/action', { action: id });
    expect(link.statusCode).toBe(200);
    expect(await t.prisma.findingRule.count({ where: { key: 'tryggleik.f12' } })).toBe(versions);
    const list = (await t.call('GET', '/api/admin/actions')).json<{ id: string; rules: string[] }[]>();
    expect(list.find((a) => a.id === id)?.rules).toEqual(['tryggleik.f12']);
    expect(
      (await t.call('PUT', '/api/admin/finding-rules/zz.missing/action', { action: id })).statusCode,
    ).toBe(404);
    expect(
      (await t.call('POST', '/api/admin/actions', { name: `Kurs i passord ${t.mark}`, description: 'x', seminar_topic: 'y' })).statusCode,
    ).toBe(409);
    await t.call('PUT', '/api/admin/finding-rules/tryggleik.f12/action', { action: null });
    expect(await t.prisma.findingRuleAction.count({ where: { rule_key: 'tryggleik.f12' } })).toBe(0);
  });
});
