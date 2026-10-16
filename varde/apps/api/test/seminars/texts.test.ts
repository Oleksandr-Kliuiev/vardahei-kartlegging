// 3.2 (unit): the two consent texts are versioned (a change of text needs a new version), nynorsk
// without bokmål forms; seminar times in Europe/Oslo in nynorsk and English.
import { createHash } from 'node:crypto';
import { findBokmal } from '@varde/schema/i18n/nn-stoplist';
import { describe, expect, it } from 'vitest';
import { CONSENT } from '../../src/modules/seminars/consent.js';
import { dayText, osloInstant, osloParts, whenText } from '../../src/modules/seminars/when.js';

/**
 * Every consent version ever shown, with the hash of its texts: the registration stores the
 * version of the required box, the contact that of the box for invitations. «Les meir» belongs
 * to both: a change there needs two new versions.
 */
const VERSIONS: Record<string, string> = {
  'pamelding-v1': 'bacb4a76de12b56fa4ffdef9f8318140e3e5236fb637fd5f9c2d2193d89d5062',
  'invitasjon-v1': '5573a9c28fc4cfdfedeffe1b6faa4bd43317626886157fa9fdc1929cd4ebd46f',
};

const hash = (box: 'short' | 'invite') =>
  createHash('sha256')
    .update(JSON.stringify((['nn', 'en'] as const).map((l) => [CONSENT[l][box], CONSENT[l].full])))
    .digest('hex');

describe('consent in two boxes (3.2, decision 16.10)', () => {
  it('the texts belong to their version: change a text, change its version', () => {
    for (const [version, box] of [
      [CONSENT.version, 'short'],
      [CONSENT.invite_version, 'invite'],
    ] as const) {
      expect(Object.keys(VERSIONS)).toContain(version);
      expect(hash(box), `new texts need a version after ${version}`).toBe(VERSIONS[version]);
    }
  });
  it('the boxes say what Oleksandr decided', () => {
    expect(CONSENT.nn.short).toBe(
      'Eg samtykkjer i at Vardahei IT lagrar namnet, bedrifta og e-postadressa mi for denne påmeldinga.',
    );
    expect(CONSENT.nn.invite).toBe('Eg vil gjerne få invitasjon til seinare seminar frå Vardahei IT.');
  });
  it('nynorsk without bokmål forms; English has the same parts', () => {
    for (const line of [CONSENT.nn.short, CONSENT.nn.invite, ...CONSENT.nn.full])
      expect(findBokmal(line), line).toEqual([]);
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
