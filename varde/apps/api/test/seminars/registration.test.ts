// 3.2 (integration): the public seminar page and its API. Registration creates a contact and a
// registration; a repeat is the same answer and no duplicate; the honeypot is answered the same
// and stores nothing; limits from config/quotas.json; no name or e-mail in any log line; the
// calendar file parses.
import 'reflect-metadata';
import ICAL from 'ical.js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsService } from '../../src/modules/events/events.service.js';
import { PrivacyService } from '../../src/modules/privacy/privacy.service.js';
import { CONSENT } from '../../src/modules/seminars/consent.js';
import { PublicSeminarService, REGISTRATION_QUOTA } from '../../src/modules/seminars/public-seminar.service.js';
import { RUNNER_CSP } from '../../src/runner/static.js';
import { captureOutput } from '../support/capture-output.js';
import {
  contactsOf,
  createSeminar,
  email,
  makeClients,
  PUBLIC_URL,
  registrationsOf,
  seminarApp,
  type SeminarApp,
} from '../support/seminars.js';

let t: SeminarApp;
let clients: { id: string; slug: string; name: string }[];
let limits: PublicSeminarService['limits'];

beforeAll(async () => {
  t = await seminarApp();
  clients = await makeClients(t);
  limits = { ...t.app.get(PublicSeminarService).limits };
}, 120_000);
beforeEach(() => {
  Object.assign(t.app.get(PublicSeminarService).limits, limits);
});
afterAll(async () => {
  await t.close();
});

let ip = 0;
const nextIp = () => `198.51.100.${(ip++ % 250) + 1}`;
const pub = (method: 'GET' | 'POST', url: string, code: string, payload?: unknown, from = nextIp()) =>
  t.call(method, url, payload, { cookie: '', authorization: `Bearer ${code}`, 'x-forwarded-for': from });
const body = (n: number | string, over: Record<string, unknown> = {}) => ({
  name: `ZZ Deltakar ${n}`,
  email: email(t, n),
  company: { client: clients[0]!.slug },
  consent: CONSENT.version,
  lang: 'nn',
  ...over,
});

describe('public seminar view', () => {
  it('unknown, malformed and missing codes are one 403', async () => {
    for (const code of ['', 'kort', 'A'.repeat(22)]) {
      const res = await pub('GET', '/api/public/seminar', code);
      expect(res.statusCode).toBe(403);
      expect(res.json<{ message: string }>().message).toBe('Lenkja er ikkje gyldig.');
    }
  });

  it('shows topic, time and place in the languages of the seminar, the clients and the consent', async () => {
    const s = await createSeminar(t, { clients: clients.map((c) => c.id) });
    const res = await pub('GET', '/api/public/seminar', s.code);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toMatchObject({
      languages: ['nn', 'en'],
      topic: { nn: `Passord og MFA ${t.mark}`, en: `Passwords and MFA ${t.mark}` },
      when: { nn: 'torsdag 5. november 2099, kl. 09.00–11.30', en: 'Thursday 5 November 2099, 09:00–11:30' },
      place: 'Vardahei IT, Sogndal',
      format: 'onsite',
      phase: 'open',
      consent: { version: CONSENT.version, invite_version: CONSENT.invite_version, nn: CONSENT.nn, en: CONSENT.en },
    });
    expect(res.json<{ clients: { key: string; name: string }[] }>().clients).toEqual(
      [...clients].sort((a, b) => a.name.localeCompare(b.name, 'nb')).map((c) => ({ key: c.slug, name: c.name })),
    );
    // No database ids leave the public page (the company is picked by the client's slug).
    for (const c of clients) expect(res.body).not.toContain(c.id);
    expect(res.body).not.toMatch(/registrations|code|ZZ Deltakar/);
  });

  it('a nynorsk-only seminar offers only nynorsk', async () => {
    const s = await createSeminar(t, { languages: ['nn'], topic_en: undefined });
    const view = (await pub('GET', '/api/public/seminar', s.code)).json<{ languages: string[]; topic: object }>();
    expect(view.languages).toEqual(['nn']);
    expect(Object.keys(view.topic)).toEqual(['nn']);
  });
});

describe('registration', () => {
  it('creates a contact and a registration; a repeat with the same e-mail is the same answer, no duplicate', async () => {
    const s = await createSeminar(t, { clients: clients.map((c) => c.id) });
    const changed = vi.spyOn(t.app.get(EventsService), 'changed');
    const first = await pub('POST', '/api/public/seminar/registrations', s.code, body(1));
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ registered: true });
    expect(changed).toHaveBeenCalledWith('seminars');
    changed.mockClear();
    const again = await pub(
      'POST',
      '/api/public/seminar/registrations',
      s.code,
      body(1, { name: 'ZZ Nokon Annan', email: `  ${email(t, 1).toUpperCase()} ` }),
    );
    expect(again.statusCode).toBe(200);
    expect(again.body).toBe(first.body);
    expect(changed).not.toHaveBeenCalled();
    changed.mockRestore();
    expect(await registrationsOf(s.id)).toHaveLength(1);
    const contact = (await contactsOf(t)).find((c) => c.email === email(t, 1))!;
    // Only the required box: the consent is on the registration, none to invitations on the contact.
    expect(contact).toMatchObject({
      name: 'ZZ Deltakar 1',
      company: clients[0]!.name,
      client_id: clients[0]!.id,
      invite_consent_version: null,
      invite_consent_at: null,
    });
    expect((await registrationsOf(s.id))[0]?.consent_version).toBe(CONSENT.version);
  });

  it('the optional box gives consent to invitations; a later form without it does not take it away', async () => {
    const one = await createSeminar(t),
      two = await createSeminar(t);
    const ticked = body('invite', { company: { name: 'X' }, invite: CONSENT.invite_version });
    expect((await pub('POST', '/api/public/seminar/registrations', one.code, ticked)).statusCode).toBe(200);
    const invited = async () => (await contactsOf(t)).find((c) => c.email === email(t, 'invite'))!;
    expect(await invited()).toMatchObject({ invite_consent_version: CONSENT.invite_version });
    const before = await invited();
    const plain = body('invite', { company: { name: 'Y' }, name: 'ZZ Anna' });
    expect((await pub('POST', '/api/public/seminar/registrations', two.code, plain)).statusCode).toBe(200);
    expect(await invited()).toEqual(before);
    expect(await registrationsOf(two.id)).toHaveLength(1);
    // An old or made-up version of the invitation text is not taken as consent.
    const old = body('invite-old', { company: { name: 'X' }, invite: 'invitasjon-v0' });
    expect((await pub('POST', '/api/public/seminar/registrations', one.code, old)).statusCode).toBe(409);
    expect((await pub('POST', '/api/public/seminar/registrations', one.code, { ...old, invite: true })).statusCode).toBe(400);
    expect((await contactsOf(t)).some((c) => c.email === email(t, 'invite-old'))).toBe(false);
  });

  it('own company text, English, and wrong input with messages that say nothing about others', async () => {
    const s = await createSeminar(t, { clients: [clients[0]!.id] });
    const own = await pub(
      'POST',
      '/api/public/seminar/registrations',
      s.code,
      body('own', { company: { name: 'Eige firma AS' }, lang: 'en' }),
    );
    expect(own.statusCode).toBe(200);
    const row = (await contactsOf(t)).find((c) => c.email === email(t, 'own'))!;
    expect(row).toMatchObject({ company: 'Eige firma AS', client_id: null });
    expect((await registrationsOf(s.id))[0]?.lang).toBe('en');
    const bad = async (over: Record<string, unknown>) => {
      const res = await pub('POST', '/api/public/seminar/registrations', s.code, body('bad', over));
      return [res.statusCode, res.json<{ message: string }>().message] as const;
    };
    expect(await bad({ name: ' ' })).toEqual([400, 'Skriv namnet ditt.']);
    expect(await bad({ email: 'ikkje-ei-adresse' })).toEqual([400, 'Skriv ei gyldig e-postadresse.']);
    expect(await bad({ company: { client: clients[1]!.slug } })).toEqual([400, 'Vel bedrift, eller skriv namnet på bedrifta.']);
    expect(await bad({ company: { client: clients[0]!.id } })).toEqual([400, 'Vel bedrift, eller skriv namnet på bedrifta.']);
    expect(await bad({ company: {} })).toEqual([400, 'Vel bedrift, eller skriv namnet på bedrifta.']);
    const tick = 'Kryss av for at vi kan lagre opplysningane for påmeldinga, så kan du melde deg på.';
    expect(await bad({ consent: undefined })).toEqual([400, tick]);
    expect(await bad({ consent: undefined, invite: CONSENT.invite_version })).toEqual([400, tick]);
    // The same answer for a person who is already registered: it says nothing about who is there.
    expect(await bad({ consent: undefined, email: email(t, 'own') })).toEqual([400, tick]);
    expect((await bad({ consent: 'pamelding-v0' }))[0]).toBe(409);
    expect((await bad({ lang: 'nb' }))[0]).toBe(400);
    expect((await bad({ extra: 'x' }))[0]).toBe(400);
    expect((await contactsOf(t)).some((c) => c.email === email(t, 'bad'))).toBe(false);
  });

  it('the honeypot gets the same answer and nothing is stored', async () => {
    const s = await createSeminar(t);
    const res = await pub('POST', '/api/public/seminar/registrations', s.code, body('bot', { company: { name: 'Bot' }, website: 'https://spam.example' }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ registered: true });
    expect(await registrationsOf(s.id)).toHaveLength(0);
    expect((await contactsOf(t)).some((c) => c.email === email(t, 'bot'))).toBe(false);
  });

  it('after the seminar registration is closed (410) and the page shows the held phase without consent', async () => {
    const s = await createSeminar(t, { date: '2020-02-03' });
    const res = await pub('POST', '/api/public/seminar/registrations', s.code, body('late', { company: { name: 'X' } }));
    expect(res.statusCode).toBe(410);
    expect(res.json<{ message: string }>().message).toBe('Påmeldinga er stengd.');
    expect((await pub('GET', '/api/public/seminar', s.code)).json()).toMatchObject({ phase: 'held', consent: null });
  });
});

describe('«Ny lenkje» (ADR-009)', () => {
  it('the old code stops at once and says it was replaced; the new one works; AuditLog has hash prefixes', async () => {
    const s = await createSeminar(t);
    expect((await t.call('POST', `/api/admin/seminars/${s.id}/reissue`, undefined, { cookie: '' })).statusCode).toBe(401);
    const res = await t.call('POST', `/api/admin/seminars/${s.id}/reissue`);
    expect(res.statusCode).toBe(201);
    const fresh = (await t.prisma.seminar.findUniqueOrThrow({ where: { id: s.id } })).code;
    expect(fresh).not.toBe(s.code);
    expect(res.json()).toEqual({ id: s.id, link: `${PUBLIC_URL}/s?c=${fresh}` });
    const old = await pub('GET', '/api/public/seminar', s.code);
    expect(old.statusCode).toBe(403);
    expect(old.json<{ message: string }>().message).toBe('Lenkja er bytt ut. Spør den som sende deg ho om den nye.');
    expect((await pub('POST', '/api/public/seminar/registrations', s.code, body('old-code', { company: { name: 'X' } }))).statusCode).toBe(403);
    expect((await pub('GET', '/api/public/seminar/calendar', s.code)).statusCode).toBe(403);
    expect((await pub('GET', '/api/public/seminar', fresh)).statusCode).toBe(200);
    expect((await t.call('GET', `/api/admin/seminars/${s.id}`)).json<{ link: string }>().link).toBe(`${PUBLIC_URL}/s?c=${fresh}`);
    const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { what: 'seminars.code.reissue', target: `seminar:${s.id}` } });
    expect(Object.keys(audit.details as object).sort()).toEqual(['hash', 'old']);
    expect(JSON.stringify(audit)).not.toContain(s.code);
    expect(JSON.stringify(audit)).not.toContain(fresh);
    expect((await t.call('POST', `/api/admin/seminars/${randomUUID()}/reissue`)).statusCode).toBe(404);
  });
});

describe('limits from config/quotas.json', () => {
  it('per seminar: a new e-mail and a repeat alike get 429 when the seminar is full', async () => {
    const s = await createSeminar(t);
    t.app.get(PublicSeminarService).limits.seminar_registrations_max = 2;
    for (const n of ['cap1', 'cap2'])
      expect((await pub('POST', '/api/public/seminar/registrations', s.code, body(n, { company: { name: 'X' } }))).statusCode).toBe(200);
    for (const n of ['cap3', 'cap1']) {
      const res = await pub('POST', '/api/public/seminar/registrations', s.code, body(n, { company: { name: 'X' } }));
      expect(res.statusCode).toBe(429);
      expect(res.json<{ message: string }>().message).toBe(REGISTRATION_QUOTA);
    }
    expect(await registrationsOf(s.id)).toHaveLength(2);
  });

  it('the default is 20 registrations per IP in 10 minutes (one office behind NAT fits; one IP cannot fill a seminar fast)', async () => {
    expect(limits.seminar_per_ip_per_10min).toBe(20);
    const s = await createSeminar(t);
    const office = '203.0.113.20';
    for (let n = 1; n <= 20; n++)
      expect((await pub('POST', '/api/public/seminar/registrations', s.code, body(`nat${n}`, { company: { name: 'X' } }), office)).statusCode).toBe(200);
    expect((await pub('POST', '/api/public/seminar/registrations', s.code, body('nat21', { company: { name: 'X' } }), office)).statusCode).toBe(429);
  });

  it('per IP in 10 minutes (an office behind one NAT has its own window), and in total', async () => {
    const s = await createSeminar(t);
    const svc = t.app.get(PublicSeminarService);
    svc.limits.seminar_per_ip_per_10min = 3;
    const office = '203.0.113.7';
    for (const n of [1, 2, 3])
      expect((await pub('POST', '/api/public/seminar/registrations', s.code, body(`ip${n}`, { company: { name: 'X' } }), office)).statusCode).toBe(200);
    expect((await pub('POST', '/api/public/seminar/registrations', s.code, body('ip4', { company: { name: 'X' } }), office)).statusCode).toBe(429);
    expect((await pub('POST', '/api/public/seminar/registrations', s.code, body('ip4', { company: { name: 'X' } }), '203.0.113.8')).statusCode).toBe(200);
    // A wrong request does not use up the window of an IP.
    const other = '203.0.113.9';
    for (let i = 0; i < 3; i++)
      expect((await pub('POST', '/api/public/seminar/registrations', s.code, body('ipx', { email: 'x' }), other)).statusCode).toBe(400);
    for (const n of [5, 6, 7])
      expect((await pub('POST', '/api/public/seminar/registrations', s.code, body(`ip${n}`, { company: { name: 'X' } }), other)).statusCode).toBe(200);
    // In total: a window of 0 stops everyone.
    svc.limits.seminar_global_per_10min = 0;
    expect((await pub('POST', '/api/public/seminar/registrations', s.code, body('glob', { company: { name: 'X' } }))).statusCode).toBe(429);
  });
});

describe('logs and errors carry no names or e-mail', () => {
  it('successful page, view, registration and calendar leave no log line; a database error leaves no address', async () => {
    const s = await createSeminar(t);
    const out = captureOutput();
    try {
      const page = await t.call('GET', `/s?c=${s.code}`, undefined, { cookie: '' });
      expect(page.statusCode).toBe(200);
      expect(page.headers['content-security-policy']).toBe(RUNNER_CSP);
      expect(page.headers['x-frame-options']).toBe('DENY');
      expect(page.headers['referrer-policy']).toBe('no-referrer');
      expect(page.body).toContain('/r/assets/seminar-');
      expect((await pub('GET', '/api/public/seminar', s.code)).statusCode).toBe(200);
      expect((await pub('POST', '/api/public/seminar/registrations', s.code, body('log', { company: { name: 'Loggfirma' } }))).statusCode).toBe(200);
      expect((await pub('GET', '/api/public/seminar/calendar', s.code)).statusCode).toBe(200);
      expect(out.lines().filter((l) => l.startsWith('{') && l.includes('"path"'))).toEqual([]);
      const fail = vi
        .spyOn(t.app.get(PrivacyService).participants, 'register')
        .mockRejectedValueOnce(new Error(`Invalid prisma.contact.create() { email: "${email(t, 'boom')}", name: "ZZ Boom" }`));
      const boom = await pub('POST', '/api/public/seminar/registrations', s.code, body('boom', { name: 'ZZ Boom', company: { name: 'X' } }));
      fail.mockRestore();
      expect(boom.statusCode).toBe(503);
      expect(boom.body).not.toMatch(/ZZ Boom|example\.test/);
      const bad = await pub('POST', '/api/public/seminar/registrations', s.code, body('bad2', { email: 'x' }));
      expect(bad.statusCode).toBe(400);
      expect(out.text()).not.toMatch(/example\.test|ZZ Deltakar|ZZ Boom|Loggfirma/);
      expect(out.text()).not.toContain(s.code);
      // Errors are logged with the path only.
      expect(out.lines().some((l) => l.includes('"/api/public/seminar/registrations"') && l.includes('"status":503'))).toBe(true);
    } finally {
      out.restore();
    }
  });
});

describe('calendar file of the page', () => {
  it('is an attachment in the chosen language with the link back to the page', async () => {
    const s = await createSeminar(t);
    const res = await pub('GET', '/api/public/seminar/calendar?lang=en', s.code);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="seminar.ics"');
    const e = new ICAL.Event(new ICAL.Component(ICAL.parse(res.body) as unknown[]).getFirstSubcomponent('vevent')!);
    expect(e.summary).toBe(`Passwords and MFA ${t.mark}`);
    expect(e.uid).toBe(`seminar-${s.id}@varde.test`);
    expect(e.startDate.toJSDate().toISOString()).toBe('2099-11-05T08:00:00.000Z');
    expect(e.description).toContain(`${PUBLIC_URL}/s?c=${s.code}`);
    const nn = new ICAL.Event(
      new ICAL.Component(ICAL.parse((await pub('GET', '/api/public/seminar/calendar?lang=xx', s.code)).body) as unknown[]).getFirstSubcomponent('vevent')!,
    );
    expect(nn.summary).toBe(`Passord og MFA ${t.mark}`);
    expect((await pub('GET', '/api/public/seminar/calendar', 'B'.repeat(22))).statusCode).toBe(403);
  });
});
