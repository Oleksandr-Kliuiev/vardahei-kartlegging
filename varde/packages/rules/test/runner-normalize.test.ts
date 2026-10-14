// 1.6: normalizer (as kartlegging server.js::valider, plus exclusive options and identifier).
import { describe, expect, it } from 'vitest';
import {
  normalizeAnswers,
  normalizeFree,
  normalizeRespondentKey,
} from '../src/runner/normalize.js';
import { ANON, VERSION } from './support/version.js';

describe('normalizeAnswers (1.6)', () => {
  it.each([
    [' olnor ', 'OLNOR'],
    ['abcdefghij', 'ABCDEFGH'],
    ['   ', null],
  ])('identifier %j → respondent_key %j and not in answers', (raw, key) => {
    const n = normalizeAnswers(VERSION, { ID: raw, R: 'kontor' });
    expect(n.respondent_key).toBe(key);
    expect(n.answers).not.toHaveProperty('ID');
    expect(n.answers).toEqual({ R: 'kontor' });
  });

  it('anonymous version: an identifier field is not a question and gives no key', () => {
    const n = normalizeAnswers(ANON, { ID: 'OLNOR', R: 'kontor' });
    expect(n.respondent_key).toBeNull();
    expect(n.answers).toEqual({ R: 'kontor' });
    expect(n.dropped).toBe(1);
  });

  it('multi: dedupe, known ids only', () => {
    expect(normalizeAnswers(VERSION, { T: ['epost', 'epost', 'x'] }).answers).toEqual({
      T: ['epost'],
    });
  });

  it('exclusive option displaces the others', () => {
    expect(normalizeAnswers(VERSION, { T: ['epost', 'ingen'] }).answers).toEqual({ T: ['ingen'] });
  });

  it('more than max_choices → dropped (as valider)', () => {
    const n = normalizeAnswers(VERSION, { T: ['epost', 'referat', 'timar', 'x', 'epost'] });
    expect(n.answers).toEqual({ T: ['epost', 'referat', 'timar'] });
    const over = normalizeAnswers(
      {
        ...VERSION,
        questions: VERSION.questions.map((q) => (q.id === 'T' ? { ...q, max_choices: 2 } : q)),
      },
      { T: ['epost', 'referat', 'timar'] },
    );
    expect(over.answers).toEqual({});
    expect(over.dropped).toBe(1);
  });

  it('text: trim and length; empty → no answer', () => {
    expect(normalizeAnswers(VERSION, { F: '  hei  ', R: '' }).answers).toEqual({ F: 'hei' });
    expect((normalizeAnswers(VERSION, { F: 'x'.repeat(2000) }).answers.F as string).length).toBe(
      1500,
    );
  });

  it('scale: integers in range per known row', () => {
    expect(normalizeAnswers(VERSION, { S: { a: 3, b: 9, c: 2 } }).answers).toEqual({ S: { a: 3 } });
    expect(normalizeAnswers(VERSION, { S: { a: 1.5 } }).answers).toEqual({});
  });

  it('nps 0–10 integers only', () => {
    expect(normalizeAnswers(VERSION, { N: 0 }).answers).toEqual({ N: 0 });
    expect(normalizeAnswers(VERSION, { N: 11 }).answers).toEqual({});
  });

  it('single: unknown option dropped and counted', () => {
    const n = normalizeAnswers(VERSION, { R: 'sjef', Z: 'x' });
    expect(n.answers).toEqual({});
    expect(n.dropped).toBe(2);
  });

  it.each(['F1', 'K0'])('normalizeFree excludes identifier %s in both modes', (id) => {
    const version = {
      ...VERSION,
      questions: VERSION.questions.map((q) => (q.identifier ? { ...q, id } : q)),
    };
    for (const identification of ['initials', 'none'] as const) {
      expect(
        normalizeFree({ ...version, identification }, { [id]: 'QAXAM', T: '  meir  ' }),
      ).toEqual({ T: 'meir' });
    }
  });

  it('normalizeRespondentKey and normalizeFree', () => {
    expect(normalizeRespondentKey(7)).toBeNull();
    expect(normalizeFree(VERSION, { T: '  meir  ', Z: 'x', F: ' ' })).toEqual({ T: 'meir' });
  });
});
