// Task 0.14: reading pack in nynorsk and the scoring sheet it pairs with.
import { findBokmal } from '@varde/schema/i18n/nn-stoplist';
import { describe, expect, it } from 'vitest';
import { parseRatings } from '../src/csv.js';
import { renderLesepakke, renderSheet, SHEET_COLUMNS } from '../src/lesepakke.js';
import { buildRecord } from '../src/record.js';
import { context, draft, message } from './support.js';

const ok = buildRecord(message(JSON.stringify(draft())), context('backup-hotell'));
const refused = buildRecord(message('', 'refusal'), context('ki-kvardag'));
const pack = renderLesepakke(
  [
    { brief: 'backup-hotell', text: '# Backup på hotellet\n\n- **Tema:** Filer.', records: [ok] },
    { brief: 'ki-kvardag', text: '# KI\n\n- **Tema:** KI.', records: [refused] },
  ],
  ['Briefar `bbbbbbbbbbbb` · prompt `aaaaaaaaaaaa` · 2 utkast.'],
);

describe('lesepakke (0.14)', () => {
  it('shows each brief, the draft with question types and the automatic findings', () => {
    expect(pack).toContain('> # Backup på hotellet');
    expect(pack).toContain('### Utkast `claude-opus-5-5#1`');
    expect(pack).toContain('1. Kvar lagrar du filer du jobbar med? _(q1, eitt svar)_');
    expect(pack).toContain('   - Veit ikkje');
    expect(pack).toContain('_(q2, fritekst · kan hoppast over)_');
    expect(pack).toContain('- Ingen funn.');
    expect(pack).toContain('Modellen nekta å svare (refusal, cyber)');
    expect(pack).toContain('- Kritisk (automatisk): refusal');
  });

  it('its own nynorsk has no bokmål forms', () => {
    expect(findBokmal(pack)).toEqual([]);
  });

  it('the empty sheet lists every output with automatic codes; filled in, it parses', () => {
    const sheet = renderSheet([ok, refused]);
    const [header, first, second] = sheet.trimEnd().split('\n');
    expect(header).toBe(SHEET_COLUMNS.join(','));
    expect(first).toBe(`backup-hotell,claude-opus-5-5#1,,,,,${ok.output_sha}`);
    expect(second).toBe(`ki-kvardag,claude-opus-5-5#1,,,,refusal,${refused.output_sha}`);
    expect(() => parseRatings(sheet, 'oleksandr.csv')).toThrow(/edit_minutes/);
    const filled = sheet
      .replace(`claude-opus-5-5#1,,,,,`, 'claude-opus-5-5#1,4,5,3,,')
      .replace(`claude-opus-5-5#1,,,,refusal`, 'claude-opus-5-5#1,1,1,20,refusal');
    const ratings = parseRatings(filled, 'oleksandr.csv');
    expect(ratings.map((r) => [r.rater, r.brief, r.meaning, r.critical])).toEqual([
      ['oleksandr', 'backup-hotell', 4, []],
      ['oleksandr', 'ki-kvardag', 1, ['refusal']],
    ]);
  });
});
