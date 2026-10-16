// 3.10 (unit): the invitation letter, the A4 poster and the read-me of the package — nynorsk
// without bokmål forms, the link and the time in Oslo, the QR code made here, nothing from
// outside, and the contact of Vardahei IT as on the other screens.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findBokmal } from '@varde/schema/i18n/nn-stoplist';
import { describe, expect, it } from 'vitest';
import { qrSvg } from '../../src/modules/rounds/poster.js';
import {
  invitationText,
  readme,
  seminarPoster,
  VARDAHEI_CONTACT,
  type InvitationSeminar,
} from '../../src/modules/seminars/invitation.js';
import { osloInstant } from '../../src/modules/seminars/when.js';

const LINK = 'https://varde.test/s?c=Abcdefghijklmnopqrstuv';
const seminar: InvitationSeminar = {
  topic_nn: 'Passord og MFA',
  topic_en: 'Passwords and MFA',
  starts_at: osloInstant('2026-11-05', '09:00'),
  ends_at: osloInstant('2026-11-05', '11:30'),
  place: 'Vardahei IT, Sogndal',
  format: 'onsite',
  clients: ['Syntetisk A', 'Syntetisk B'],
};

describe('invitation letter (3.10)', () => {
  it('nynorsk: topic, Oslo time, place, clients and the link; no bokmål forms', () => {
    const text = invitationText(seminar, 'nn', LINK, 'varde.test');
    expect(text).toContain('Vardahei IT inviterer til seminaret «Passord og MFA».');
    expect(text).toContain('Når: torsdag 5. november 2026, kl. 09.00–11.30');
    expect(text).toContain('Kvar: Vardahei IT, Sogndal');
    expect(text).toContain('For: Syntetisk A og Syntetisk B');
    expect(text).toContain(`\n${LINK}\n`);
    expect(text).toContain('Lenkja går til varde.test');
    expect(findBokmal(text)).toEqual([]);
  });
  it('English, and a digital seminar without clients', () => {
    const text = invitationText({ ...seminar, format: 'digital', place: 'Teams', clients: [] }, 'en', LINK, 'varde.test');
    expect(text).toContain('Vardahei IT invites you to the seminar “Passwords and MFA”.');
    expect(text).toContain('When: Thursday 5 November 2026, 09:00–11:30');
    expect(text).toContain('Where: Online, Teams');
    expect(text).not.toContain('For:');
  });
});

describe('A4 poster (3.10)', () => {
  const html = seminarPoster({ ...seminar, topic_nn: 'Passord <script>alert(1)</script> & MFA' }, 'nn', LINK);
  it('carries the QR code of the link, made here with qrcode-generator', () => {
    expect(html).toContain(qrSvg(LINK));
    expect(html).toContain(`<p class="lenkje">${LINK}</p>`);
    expect(html).toContain('@page { size: A4 portrait; margin: 0; }');
  });
  it('escapes the texts and loads nothing from outside', () => {
    expect(html).not.toContain('<script>');
    expect(html).toContain('Passord &lt;script&gt;alert(1)&lt;/script&gt; &amp; MFA');
    expect(html).not.toMatch(/(src|href)="https?:/);
    expect(html).not.toMatch(/@import|url\(/);
    expect(html).toContain('Seminar for Syntetisk A og Syntetisk B');
    expect(html).toContain(VARDAHEI_CONTACT.phone);
  });
  it('nynorsk without bokmål forms', () => {
    const text = html.replace(/<[^>]+>/g, ' ');
    expect(findBokmal(text)).toEqual([]);
    expect(findBokmal(readme(['nn', 'en']))).toEqual([]);
  });
});

describe('the package read-me and the contact', () => {
  it('names every file, in both languages when English is on', () => {
    const nn = readme(['nn']),
      both = readme(['nn', 'en']);
    for (const f of ['invitasjon.txt', 'lenkje-til-pamelding.txt', 'seminar.ics', 'plakat.html'])
      expect(nn).toContain(f);
    expect(nn).not.toContain('-en.');
    for (const f of ['invitation-en.txt', 'seminar-en.ics', 'plakat-en.html']) expect(both).toContain(f);
    expect(nn).toContain('Varde sender ingenting sjølv');
  });
  it('the contact equals intro.contact of every seed template', () => {
    const dir = resolve(__dirname, '../../../../config/seed/templates');
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const t = JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as {
        content: { intro: { contact: { name: string; phone: string; email: string } } };
      };
      expect(t.content.intro.contact, f).toMatchObject(VARDAHEI_CONTACT);
    }
  });
});
