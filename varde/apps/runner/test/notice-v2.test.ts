// Task 0.18: texts of the respondent notice v2 (nn, en; nb empty until the switch, 1.3).
// A cheap filter, not a replacement for Oleksandr's approval (gate G2).
import { findBokmal } from '@varde/schema/i18n/nn-stoplist';
import { describe, expect, it } from 'vitest';
import en from '../src/i18n/notice-v2.en.json';
import nb from '../src/i18n/notice-v2.nb.json';
import nn from '../src/i18n/notice-v2.nn.json';

const KEYS = [
  'notice.identified.intro',
  'notice.identified.who_sees',
  'notice.identified.client_gets',
  'notice.identified.retention',
  'notice.identified.roles',
  'notice.identified.client_rights',
  'notice.anonymous.intro',
  'notice.anonymous.client_gets',
  'notice.common.ai_processing',
  'notice.common.exact_count',
  'notice.common.leader_not_anonymous',
  'notice.common.small_groups',
];

const texts: Record<string, Record<string, string>> = { nn, en };
const all = (): [string, string, string][] =>
  Object.entries(texts).flatMap(([lang, t]) =>
    Object.entries(t).map(([key, value]): [string, string, string] => [lang, key, value]),
  );

describe('notice v2 (0.18)', () => {
  it('nn and en have the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(nn).sort());
  });

  it('every key of the list is present', () => {
    expect(Object.keys(nn).sort()).toEqual([...KEYS].sort());
  });

  it('nb.json parses and is empty', () => {
    expect(nb).toEqual({});
  });

  it('no value is empty', () => {
    for (const [lang, key, value] of all()) expect(value.trim(), `${lang} ${key}`).not.toBe('');
  });

  it('nn texts contain no bokmål forms of nn-stoplist', () => {
    for (const [key, value] of Object.entries(nn)) expect(findBokmal(value), key).toEqual([]);
  });

  it('notice.identified.* never says anonym', () => {
    for (const [lang, key, value] of all()) {
      if (key.startsWith('notice.identified.')) {
        expect(value.toLowerCase(), `${lang} ${key}`).not.toContain('anonym');
      }
    }
  });

  it('the manager part is named as not anonymous (nn and en)', () => {
    expect(nn['notice.common.leader_not_anonymous']).toMatch(/ikkje anonyme/);
    expect(en['notice.common.leader_not_anonymous']).toMatch(/not anonymous/);
  });

  it('no deletion-by-date promise', () => {
    for (const [lang, key, value] of all()) {
      expect(value.toLowerCase(), `${lang} ${key}`).not.toMatch(/slettast etter|deleted after/);
    }
  });

  it('no "never" next to the company (the company may get per-person answers on request)', () => {
    for (const [lang, key, value] of all()) {
      for (const sentence of value.toLowerCase().split(/[.;:!?]/)) {
        const never = /\b(aldri|never)\b/.test(sentence);
        const company = /\b(bedrift\p{L}*|company|companies)\b/u.test(sentence);
        expect(never && company, `${lang} ${key}: ${sentence}`).toBe(false);
      }
    }
  });

  it('the identified texts name three people at Vardahei IT and the client rights', () => {
    expect(nn['notice.identified.who_sees']).toMatch(/Svara per person ser berre Vardahei IT/);
    expect(nn['notice.identified.who_sees']).toMatch(/tre tilsette/);
    expect(nn['notice.identified.client_gets']).toMatch(/samla bilete utan initialar/);
    expect(nn['notice.identified.client_rights']).toMatch(/utlevert/);
    expect(nn['notice.identified.client_rights']).toMatch(/sletta/);
    expect(nn['notice.anonymous.intro']).toMatch(
      /Vardahei IT ser svara, men ikkje kven som svarte/,
    );
  });
});
