// 3.2 (unit): the calendar file follows RFC 5545 — CRLF, folding at 75 octets without splitting
// a UTF-8 character, escaped TEXT — and an independent parser (ical.js) reads it back exactly.
import ICAL from 'ical.js';
import { describe, expect, it } from 'vitest';
import { calendarFile, foldLine, icsText, icsTime } from '../../src/modules/seminars/ics.js';

const event = {
  uid: 'seminar-0b6a5e2c-1d2e-4f6a-9b8c-7d6e5f4a3b2c@varde.test',
  sequence: 2,
  stamp: new Date('2026-10-16T10:15:30.123Z'),
  start: new Date('2026-11-05T08:00:00Z'),
  end: new Date('2026-11-05T10:30:00Z'),
  summary: 'Passord, MFA; og «backup» – kva gjer vi\\no?',
  location: 'Vardahei IT, Sogndal; 2. etasje',
  description:
    'Seminar frå Vardahei IT. Etter seminaret finn du lysark og lenkjer på påmeldingssida: https://varde.test/s?c=Abcdefghijklmnopqrstuv\nLinje to med æøå og 🙂.',
  url: 'https://varde.test/s?c=Abcdefghijklmnopqrstuv',
};

describe('calendar file (RFC 5545)', () => {
  const file = calendarFile(event);

  it('has CRLF line ends only and no line over 75 octets', () => {
    expect(file.endsWith('\r\n')).toBe(true);
    expect(file.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    for (const line of file.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    expect(file.split('\r\n').some((l) => l.startsWith(' '))).toBe(true);
  });

  it('folding never splits a UTF-8 character and unfolds to the same line', () => {
    const line = `DESCRIPTION:${'æøå🙂'.repeat(40)}`;
    const folded = foldLine(line);
    for (const part of folded.split('\r\n')) {
      expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(75);
      expect(part).not.toContain('�');
    }
    expect(folded.replace(/\r\n /g, '')).toBe(line);
    expect(foldLine('SUMMARY:kort')).toBe('SUMMARY:kort');
  });

  it('escapes TEXT values and writes UTC times', () => {
    expect(icsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    expect(icsTime(new Date('2026-11-05T08:00:00.000Z'))).toBe('20261105T080000Z');
    expect(file).toContain('DTSTART:20261105T080000Z\r\n');
    expect(file).toContain('DTSTAMP:20261016T101530Z\r\n');
  });

  it('ical.js reads back UID, DTSTAMP, DTSTART, DTEND, SUMMARY, LOCATION, DESCRIPTION, URL and SEQUENCE', () => {
    const calendar = new ICAL.Component(ICAL.parse(file) as unknown[]);
    expect(calendar.getFirstPropertyValue('version')).toBe('2.0');
    expect(calendar.getFirstPropertyValue('method')).toBe('PUBLISH');
    const vevent = calendar.getFirstSubcomponent('vevent')!;
    const e = new ICAL.Event(vevent);
    expect(e.uid).toBe(event.uid);
    expect(e.summary).toBe(event.summary);
    expect(e.location).toBe(event.location);
    expect(e.description).toBe(event.description);
    expect(e.sequence).toBe(2);
    expect(e.startDate.toJSDate().toISOString()).toBe('2026-11-05T08:00:00.000Z');
    expect(e.endDate.toJSDate().toISOString()).toBe('2026-11-05T10:30:00.000Z');
    expect(e.startDate.zone?.tzid).toBe('UTC');
    expect(String(vevent.getFirstPropertyValue('dtstamp'))).toBe('2026-10-16T10:15:30Z');
    expect(vevent.getFirstPropertyValue('url')).toBe(event.url);
  });

  it('without a link there is no URL line', () => {
    expect(calendarFile({ ...event, url: null })).not.toContain('URL:');
  });
});
