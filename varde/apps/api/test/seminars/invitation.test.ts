// 3.10 (integration): «Last ned invitasjon» — the letter, the calendar file, the A4 poster and
// the zip with all of it, for a person to send by hand. Admin session only; nothing is sent; the
// download is in AuditLog without the code.
import 'reflect-metadata';
import ICAL from 'ical.js';
import { TextWriter, Uint8ArrayReader, ZipReader } from '@zip.js/zip.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { qrSvg } from '../../src/modules/rounds/poster.js';
import { createSeminar, makeClients, PUBLIC_URL, seminarApp, type SeminarApp } from '../support/seminars.js';

let t: SeminarApp;
let clients: { id: string; name: string }[];
beforeAll(async () => {
  t = await seminarApp();
  clients = await makeClients(t);
}, 120_000);
afterAll(async () => {
  await t.close();
});

async function unzip(bytes: Buffer) {
  const zip = new ZipReader(new Uint8ArrayReader(new Uint8Array(bytes)), { useWebWorkers: false });
  try {
    const files: Record<string, string> = {};
    for (const entry of await zip.getEntries())
      if (!entry.directory) files[entry.filename] = await entry.getData(new TextWriter());
    return files;
  } finally {
    await zip.close();
  }
}
const vevent = (text: string) =>
  new ICAL.Event(new ICAL.Component(ICAL.parse(text) as unknown[]).getFirstSubcomponent('vevent')!);

describe('invitation of a seminar (3.10)', () => {
  it('every route needs an admin session', async () => {
    const s = await createSeminar(t);
    for (const url of [
      `/api/admin/seminars/${s.id}/invitation`,
      `/api/admin/seminars/${s.id}/calendar.ics`,
      `/api/admin/seminars/${s.id}/invitation.zip`,
      `/admin/poster/seminar/${s.id}`,
    ])
      expect([401, 302], url).toContain((await t.call('GET', url, undefined, { cookie: '' })).statusCode);
  });

  it('the letter in nynorsk and English with the registration link; a language the seminar lacks is 400', async () => {
    const s = await createSeminar(t, { clients: clients.map((c) => c.id) });
    const nn = (await t.call('GET', `/api/admin/seminars/${s.id}/invitation`)).json<{ text: string; link: string; languages: string[] }>();
    expect(nn.link).toBe(`${PUBLIC_URL}/s?c=${s.code}`);
    expect(nn.languages).toEqual(['nn', 'en']);
    expect(nn.text).toContain(`Vardahei IT inviterer til seminaret «Passord og MFA ${t.mark}».`);
    expect(nn.text).toContain(`For: ${clients.map((c) => c.name).sort().join(' og ')}`);
    expect(nn.text).toContain(nn.link);
    const en = (await t.call('GET', `/api/admin/seminars/${s.id}/invitation?lang=en`)).json<{ text: string }>();
    expect(en.text).toContain(`“Passwords and MFA ${t.mark}”`);
    const only = await createSeminar(t, { languages: ['nn'], topic_en: undefined });
    expect((await t.call('GET', `/api/admin/seminars/${only.id}/invitation?lang=en`)).statusCode).toBe(400);
  });

  it('the calendar file of the invitation points to the registration', async () => {
    const s = await createSeminar(t);
    const res = await t.call('GET', `/api/admin/seminars/${s.id}/calendar.ics`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="seminar.ics"');
    const e = vevent(res.body);
    expect(e.uid).toBe(`seminar-${s.id}@varde.test`);
    expect(e.description).toBe(`Seminar frå Vardahei IT. Meld deg på her: ${PUBLIC_URL}/s?c=${s.code}`);
    expect(e.startDate.toJSDate().toISOString()).toBe('2099-11-05T08:00:00.000Z');
  });

  it('the A4 poster opens with a narrow CSP and the QR code of the link', async () => {
    const s = await createSeminar(t);
    const res = await t.call('GET', `/admin/poster/seminar/${s.id}?lang=en`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-security-policy']).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'none'",
    );
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.body).toContain(qrSvg(`${PUBLIC_URL}/s?c=${s.code}`));
    expect(res.body).toContain('Register, it takes a minute');
  });

  it('«Last ned invitasjon»: a zip with letter, link, calendar files and posters in each language; AuditLog without the code', async () => {
    const s = await createSeminar(t, { clients: [clients[0]!.id] });
    const res = await t.call('GET', `/api/admin/seminars/${s.id}/invitation.zip`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toBe('attachment; filename="invitasjon-seminar.zip"');
    const files = await unzip(res.rawPayload);
    expect(Object.keys(files).sort()).toEqual(
      [
        'LES-MEG.txt',
        'invitasjon.txt',
        'invitation-en.txt',
        'lenkje-til-pamelding.txt',
        'plakat-en.html',
        'plakat.html',
        'seminar-en.ics',
        'seminar.ics',
      ].sort(),
    );
    const link = `${PUBLIC_URL}/s?c=${s.code}`;
    expect(files['lenkje-til-pamelding.txt']).toBe(`${link}\r\n`);
    expect(files['invitasjon.txt']).toContain(`Meld deg på her, det tek eitt minutt:\r\n${link}`);
    expect(files['invitasjon.txt']).not.toMatch(/[^\r]\n/);
    expect(vevent(files['seminar-en.ics']!).summary).toBe(`Passwords and MFA ${t.mark}`);
    expect(files['plakat.html']).toContain(qrSvg(link));
    const audit = await t.prisma.auditLog.findFirstOrThrow({
      where: { what: 'seminars.invitation', target: `seminar:${s.id}` },
    });
    expect(audit.details).toMatchObject({ files: 8 });
    expect(JSON.stringify(audit)).not.toContain(s.code);
  });

  it('without PUBLIC_URL there is no link, and the invitation says so', async () => {
    const s = await createSeminar(t);
    const saved = process.env.PUBLIC_URL;
    delete process.env.PUBLIC_URL;
    try {
      const res = await t.call('GET', `/api/admin/seminars/${s.id}/invitation.zip`);
      expect(res.statusCode).toBe(503);
      expect(res.json<{ message: string }>().message).toBe('Adressa til Varde (PUBLIC_URL) er ikkje sett opp.');
      expect((await t.call('GET', `/api/admin/seminars/${s.id}`)).json<{ link: unknown }>().link).toBeNull();
    } finally {
      process.env.PUBLIC_URL = saved;
    }
  });
});
