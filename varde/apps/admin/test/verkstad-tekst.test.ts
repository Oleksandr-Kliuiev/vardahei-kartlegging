// 2.16: what changed between versions, every text by its key, and what changed since an approval.
import { expect, it } from 'vitest';
import type { Question } from '../../../packages/schema/src/template/question.js';
import { respondentTexts } from '../../../packages/schema/src/template/respondent-texts.js';
import { changedSince, diffQuestions, withText } from '../src/verkstad-tekst.js';
import { editorFixture } from './editor-fixture.js';

const t = (nn: string) => ({ nn, en: nn });
const base = () => {
  const c = editorFixture().content;
  c.questions.push(
    ...([
      {
        id: 'A',
        type: 'single',
        part: 'common',
        texts: { text: t('A?') },
        options: [{ id: 'ja', texts: { text: t('Ja') } }],
      },
      { id: 'B', type: 'text', part: 'common', texts: { text: t('B?') } },
    ] as Question[]),
  );
  return c;
};

it('diff: new, changed and removed questions; a move or a new section title is no change', () => {
  const b = base();
  const c = structuredClone(b);
  c.questions.reverse();
  c.questions[0]!.texts.section_title = t('Ny seksjon');
  expect(diffQuestions(b, c)).toEqual({ added: [], changed: [], removed: [] });
  const next = structuredClone(b);
  next.questions = next.questions.filter((q) => q.id !== 'B');
  next.questions.find((q) => q.id === 'A')!.texts.text.nn = 'A, ny ordlyd?';
  next.questions.push({
    id: 'C',
    type: 'text',
    part: 'common',
    texts: { text: t('C?') },
  });
  const d = diffQuestions(b, next);
  expect(d.added.map((q) => q.id)).toEqual(['C']);
  expect(d.changed.map((x) => x.now.id)).toEqual(['A']);
  expect(d.removed.map((q) => q.id)).toEqual(['B']);
  expect(diffQuestions(null, next).added).toEqual([]);
});

it('withText writes one text in one language by its key and nothing else', () => {
  const b = base();
  const c = withText(b, 'q.A.option.ja', 'en', 'Yes');
  expect(c.questions.find((q) => q.id === 'A')).toMatchObject({
    options: [{ texts: { text: { nn: 'Ja', en: 'Yes' } } }],
  });
  expect(b.questions.find((q) => q.id === 'A')).toMatchObject({
    options: [{ texts: { text: { en: 'Ja' } } }],
  });
  expect(withText(b, 'intro.title', 'nn', 'Ny tittel').intro.title.nn).toBe('Ny tittel');
  expect(withText(b, 'leader.text', 'en', 'Leader').leader_intro.text.en).toBe('Leader');
  expect(
    withText(b, 'q.B.text', 'nn', 'B, ny?').questions.find((q) => q.id === 'B')!.texts.text.nn,
  ).toBe('B, ny?');
  expect(withText(b, 'q.Finst.text', 'nn', 'x')).toBe(b);
  // Every key the translation view shows can be written.
  for (const r of respondentTexts(b)) expect(withText(b, r.key, 'en', 'x')).not.toBe(b);
});

it('changedSince: a translation follows its own words and its Nynorsk source', () => {
  const b = base();
  const snapshot = (lang: 'nn' | 'en') => ({
    at: '2026-10-17T10:00:00.000Z',
    by: 'oid',
    texts: Object.fromEntries(
      respondentTexts(b).map((r) => [
        r.key,
        lang === 'nn' ? { nn: r.text.nn } : { nn: r.text.nn, en: r.text.en ?? '' },
      ]),
    ),
  });
  expect(changedSince(snapshot('en'), b, 'en')).toEqual([]);
  const source = withText(b, 'q.A.text', 'nn', 'A, retta?');
  expect(changedSince(snapshot('en'), source, 'en').map((r) => r.key)).toEqual(['q.A.text']);
  expect(changedSince(snapshot('nn'), withText(b, 'q.A.text', 'en', 'A?!'), 'nn')).toEqual([]);
  expect(changedSince(undefined, source, 'en')).toEqual([]);
});
