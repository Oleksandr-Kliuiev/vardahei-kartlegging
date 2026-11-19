// «Alle svar» (19.11): a question no one was shown is left out (the role question hidden 17.11
// with «vis» == «aldri»), and a cell says when the survey did not show this person the question.
import { describe, expect, it } from 'vitest';
import type { Question } from '@varde/schema/template/question';
import type { PrivacyRow } from '../../src/modules/privacy/privacy.service.js';
import { answerCells, answerQuestions } from '../../src/modules/dashboard/answer-text.js';

const text = (nn: string) => ({ text: { nn } });
const single = (id: string, extra: Partial<Question> = {}) =>
  ({
    id,
    type: 'single',
    part: 'common',
    required: true,
    texts: text(id),
    options: [
      { id: 'ja', texts: text('Ja') },
      { id: 'nei', texts: text('Nei') },
    ],
    ...extra,
  }) as unknown as Question;

const version = {
  identification: 'initials' as const,
  leader_roles: [],
  questions: [
    { ...single('F1'), type: 'text', identifier: true } as unknown as Question,
    single('F2', { role: true, visible_if: { '==': ['vis', 'aldri'] } }),
    single('F3'),
    single('F4', { visible_if: { '==': [{ var: 'F3' }, 'ja'] } }),
  ],
};
const row = (answers: Record<string, unknown>): PrivacyRow =>
  ({ client: 'c', role: '', part: 'common', answers }) as unknown as PrivacyRow;

describe('answer-text', () => {
  const a = row({ F3: 'ja', F4: 'nei' });
  const b = row({ F3: 'nei' });

  it('leaves out the identifier and a question no one was shown', () => {
    expect(answerQuestions(version, [a, b]).map((q) => q.id)).toEqual(['F3', 'F4']);
    expect(answerQuestions(version, [b]).map((q) => q.id)).toEqual(['F3']);
  });

  it('marks a cell the survey did not show this person', () => {
    const qs = answerQuestions(version, [a, b]);
    expect(answerCells(version, qs, a, {})).toEqual([
      { text: 'Ja', free: null, score: null, shown: true },
      { text: 'Nei', free: null, score: null, shown: true },
    ]);
    expect(answerCells(version, qs, b, {}).map((c) => [c.text, c.shown])).toEqual([
      ['Nei', true],
      [null, false],
    ]);
  });
});
