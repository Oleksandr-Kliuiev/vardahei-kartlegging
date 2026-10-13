// 1.6: evaluation of the restricted JsonLogic, table-driven.
import type { Expression } from '@varde/schema/template/expression';
import { describe, expect, it } from 'vitest';
import { evaluate, evaluateValue } from '../src/runner/expression.js';
import type { Answers } from '../src/runner/types.js';

const v = (id: string) => ({ var: id });
const cases: [string, Expression, Answers, boolean][] = [
  ['== on an answer', { '==': [v('A'), 'ja'] }, { A: 'ja' }, true],
  ['== with a missing answer is false', { '==': [v('A'), 'ja'] }, {}, false],
  [
    '!= with a missing answer is false (not "answered and different")',
    { '!=': [v('A'), 'ja'] },
    {},
    false,
  ],
  ['!= on a different answer', { '!=': [v('A'), 'ja'] }, { A: 'nei' }, true],
  ['empty string is no answer', { '!=': [v('A'), 'x'] }, { A: '  ' }, false],
  ['empty array is no answer', { in: ['a', v('M')] }, { M: [] }, false],
  ['in: value in a multi answer', { in: ['b', v('M')] }, { M: ['a', 'b'] }, true],
  [
    'in: single answer in a literal list',
    { in: [v('A'), ['ja', 'delvis']] },
    { A: 'delvis' },
    true,
  ],
  ['in: missing answer', { in: [v('A'), ['ja']] }, {}, false],
  ['a bare var is not truthy', { and: [v('A')] }, { A: 'ja' }, false],
  ['! of a bare var is true (no truthiness)', { '!': v('A') }, { A: 'ja' }, true],
  ['! of a predicate', { '!': [{ '==': [v('A'), 'ja'] }] }, { A: 'ja' }, false],
  ['or', { or: [{ '==': [v('A'), 'x'] }, { '==': [v('B'), 'y'] }] }, { B: 'y' }, true],
  ['and', { and: [{ '==': [v('A'), 'x'] }, { '==': [v('B'), 'y'] }] }, { A: 'x' }, false],
  [
    'some over a multi',
    { some: [v('M'), { '!=': [v(''), 'ingen'] }] },
    { M: ['ingen', 'a'] },
    true,
  ],
  [
    'some on only the excluded value',
    { some: [v('M'), { '!=': [v(''), 'ingen'] }] },
    { M: ['ingen'] },
    false,
  ],
  [
    'count ≥ 2',
    { '>=': [{ count: [v('M'), { '!=': [v(''), 'ingen'] }] }, 2] },
    { M: ['a', 'b'] },
    true,
  ],
  ['count of a missing answer is 0', { '>=': [{ count: [v('M')] }, 1] }, {}, false],
  ['scale row by question.row', { '<=': [v('S.vurdere'), 2] }, { S: { vurdere: 2 } }, true],
  ['scale row missing', { '<=': [v('S.vurdere'), 2] }, { S: { sporje: 1 } }, false],
  [
    'scale row inside some (rad.<id>)',
    { some: [v('S'), { '<=': [v('rad.vurdere'), 2] }] },
    { S: { vurdere: 1 } },
    true,
  ],
  ['> on numbers only', { '>': [v('N'), 5] }, { N: '9' }, false],
];

describe('evaluate (1.6)', () => {
  it.each(cases)('%s', (_name, expr, answers, expected) => {
    expect(evaluate(expr, answers)).toBe(expected);
  });

  it('count returns a number', () => {
    expect(
      evaluateValue({ count: [v('M'), { '!=': [v(''), 'ingen'] }] }, { M: ['a', 'ingen', 'b'] }),
    ).toBe(2);
  });
});
