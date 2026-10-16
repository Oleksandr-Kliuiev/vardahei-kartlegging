// 3.2 (unit): the consent text is versioned (a change of text needs a new version), nynorsk
// without bokmål forms; seminar times in Europe/Oslo in nynorsk and English.
import { createHash } from 'node:crypto';
import { findBokmal } from '@varde/schema/i18n/nn-stoplist';
import { describe, expect, it } from 'vitest';
import { CONSENT } from '../../src/modules/seminars/consent.js';
import { dayText, osloInstant, osloParts, whenText } from '../../src/modules/seminars/when.js';

/** Every consent version ever shown, with the hash of its texts: the contact stores the version. */
const VERSIONS: Record<string, string> = {
  'samtykke-v1': '38b2414f77495248ddf55fe70bfd51a0f822fbca420b6d2f199c3127eeb8b203',
};

const hash = () =>
  createHash('sha256')
    .update(JSON.stringify({ nn: CONSENT.nn, en: CONSENT.en }))
    .digest('hex');

describe('consent (3.2)', () => {
  it('the texts belong to their version: change the text, change the version', () => {
    expect(Object.keys(VERSIONS)).toContain(CONSENT.version);
    expect(hash(), `new texts need a version after ${CONSENT.version}`).toBe(VERSIONS[CONSENT.version]);
  });
  it('nynorsk without bokmål forms; English has the same parts', () => {
    for (const line of [CONSENT.nn.short, ...CONSENT.nn.full]) expect(findBokmal(line), line).toEqual([]);
    expect(CONSENT.en.full).toHaveLength(CONSENT.nn.full.length);
    expect(CONSENT.nn.full.join(' ')).toContain('90 dagar');
    expect(CONSENT.en.full.join(' ')).toContain('90 days');
  });
});

describe('Oslo times (3.1)', () => {
  it('winter, summer and the days of the change', () => {
    expect(osloInstant('2026-11-05', '09:00').toISOString()).toBe('2026-11-05T08:00:00.000Z');
    expect(osloInstant('2026-06-10', '09:00').toISOString()).toBe('2026-06-10T07:00:00.000Z');
    expect(osloInstant('2026-03-29', '04:00').toISOString()).toBe('2026-03-29T02:00:00.000Z');
    expect(osloInstant('2026-10-25', '04:00').toISOString()).toBe('2026-10-25T03:00:00.000Z');
    expect(osloParts(new Date('2026-06-10T22:30:00Z'))).toMatchObject({ date: '2026-06-11', time: '00:30', weekday: 4 });
  });
  it('says the day and time the same way on every page', () => {
    const start = osloInstant('2026-11-05', '09:00'),
      end = osloInstant('2026-11-05', '11:30');
    expect(whenText(start, end, 'nn')).toBe('torsdag 5. november 2026, kl. 09.00–11.30');
    expect(whenText(start, end, 'en')).toBe('Thursday 5 November 2026, 09:00–11:30');
    expect(dayText(start, 'nn')).toBe('torsdag 5. november 2026');
    expect(whenText(start, osloInstant('2026-11-06', '15:00'), 'nn')).toBe(
      'torsdag 5. november 2026, kl. 09.00 – fredag 6. november 2026, kl. 15.00',
    );
  });
});
