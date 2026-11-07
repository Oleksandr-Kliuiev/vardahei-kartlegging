// 2.22c «Leiar vs tilsette»: the pairs Oleksandr confirmed on 07.11, how a pair finds its question
// in a version of tryggleik (F by anchor, T by id; never the role or the initials, never free text)
// and the rule of a line: one hidden option hides the whole line.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import type { Question } from '@varde/schema/template/question';
import { EMPLOYEE_PAIRS, employeeQuestion } from '../../src/modules/interviews/employee-pairs.js';
import { employeeLine } from '../../src/modules/interviews/employee-view.js';
import { interviewGuideQuestions } from '../../src/modules/surveys/interview-guide.js';
import { seedContent } from '../support/seed-dir.js';

const seed = seedContent('tryggleik.2026-10-13').questions as unknown as Question[];
const text = (nn: string) => ({ text: { nn, en: nn } });
const choice = (id: string, options: string[], over: Partial<Question> = {}): Question =>
  ({
    id,
    type: 'single',
    part: 'common',
    texts: text(`Spørsmål ${id}?`),
    options: options.map((o) => ({ id: o, texts: text(o) })),
    ...over,
  }) as Question;
/** «Haust 2026» as the campaign has it: F1–F22 unchanged, T1–T5 new and without an anchor. */
const haust = [
  ...seed,
  choice('T1', ['mobil', 'pc', 'nei', 'usikker'], { type: 'multi' }),
  ...['T2', 'T3', 'T4', 'T5'].map((id) => choice(id, ['ja', 'nei'])),
];
const resolved = (questions: readonly Question[]) =>
  [...EMPLOYEE_PAIRS].map(([n, refs]) => [
    n,
    refs.map((r) => employeeQuestion(questions, r)?.id ?? null),
  ]);

describe('the pairs of decision 07.11', () => {
  it('are the confirmed table', () => {
    expect(Object.fromEntries(EMPLOYEE_PAIRS)).toEqual({
      N7: [{ anchor: 'F18' }],
      N8: [{ id: 'T5' }],
      N9: [{ anchor: 'F16' }],
      N10: [{ id: 'T1' }],
      N12: [{ anchor: 'F14' }, { anchor: 'F15' }],
      N13: [{ id: 'T2' }],
      N14: [{ anchor: 'F7' }, { anchor: 'F8' }],
      N17: [{ id: 'T3' }],
      N18: [{ anchor: 'F3' }],
      N20: [{ anchor: 'F17' }],
      N22: [{ anchor: 'F11' }],
      N23: [{ anchor: 'F9' }],
      N26: [{ anchor: 'F11' }, { id: 'T4' }],
      N27: [{ anchor: 'F5' }, { anchor: 'F6' }],
      N28: [{ anchor: 'F12' }, { id: 'T4' }],
    });
  });

  it('name questions of the standard guide; the others have no pair', () => {
    const guide = interviewGuideQuestions().map((q) => q.id);
    expect([...EMPLOYEE_PAIRS.keys()].every((n) => guide.includes(n))).toBe(true);
    expect(guide.filter((n) => !EMPLOYEE_PAIRS.has(n))).toEqual([
      'N2',
      'N3',
      'N4',
      'N5',
      'N6',
      'N11',
      'N15',
      'N16',
      'N19',
      'N21',
      'N24',
      'N25',
    ]);
  });

  it('find every question in «Haust 2026», only the F questions in the seeded version', () => {
    expect(resolved(haust)).toEqual([
      ['N7', ['F18']],
      ['N8', ['T5']],
      ['N9', ['F16']],
      ['N10', ['T1']],
      ['N12', ['F14', 'F15']],
      ['N13', ['T2']],
      ['N14', ['F7', 'F8']],
      ['N17', ['T3']],
      ['N18', ['F3']],
      ['N20', ['F17']],
      ['N22', ['F11']],
      ['N23', ['F9']],
      ['N26', ['F11', 'T4']],
      ['N27', ['F5', 'F6']],
      ['N28', ['F12', 'T4']],
    ]);
    expect(
      resolved(seed)
        .flatMap(([, ids]) => ids)
        .filter((id) => id === null),
    ).toHaveLength(6);
    expect(employeeQuestion(seed, { id: 'T2' })).toBeUndefined();
  });
});

describe('a pair across versions', () => {
  it('follows the anchor of an F question, not its id', () => {
    const renamed = seed.map((q) => (q.id === 'F14' ? { ...q, id: 'F14b' } : q));
    expect(employeeQuestion(renamed, { anchor: 'F14' })?.id).toBe('F14b');
    // A semantic change gives a new anchor: the confirmed pair no longer holds.
    const changed = seed.map((q) => (q.id === 'F14' ? { ...q, anchor_key: 'F14X' } : q));
    expect(employeeQuestion(changed, { anchor: 'F14' })).toBeUndefined();
  });

  it('finds a T question by id, never a question that only carries the same anchor', () => {
    const t2 = choice('T2', ['ja', 'nei']);
    expect(employeeQuestion([t2], { id: 'T2' })).toBe(t2);
    expect(employeeQuestion([{ ...t2, id: 'X1', anchor_key: 'T2' }], { id: 'T2' })).toBeUndefined();
  });

  it('never takes the role question, the initials, the leader part or free text', () => {
    const role = seed.find((q) => q.role)!;
    const initials = seed.find((q) => q.identifier)!;
    expect(employeeQuestion(seed, { anchor: role.anchor_key! })).toBeUndefined();
    expect(employeeQuestion(seed, { anchor: initials.anchor_key! })).toBeUndefined();
    expect(employeeQuestion(seed, { anchor: 'F21' })).toBeUndefined();
    const leader = choice('T3', ['ja', 'nei'], { part: 'leader' });
    expect(employeeQuestion([leader], { id: 'T3' })).toBeUndefined();
    // The initials stay out even as a choice question, the role question even by id.
    const asked = choice('T4', ['ja', 'nei'], { identifier: true });
    expect(employeeQuestion([asked], { id: 'T4' })).toBeUndefined();
    expect(employeeQuestion([{ ...asked, identifier: undefined }], { id: 'T4' })).toBeDefined();
    expect(employeeQuestion([{ ...role, id: 'T5' }], { id: 'T5' })).toBeUndefined();
    expect(employeeQuestion(seed, { anchor: 'F15' })?.type).toBe('multi');
  });
});

describe('a line of the employees', () => {
  const q = choice('F14', ['ja', 'nei', 'usikker']) as Extract<Question, { type: 'single' }>;
  const cell = (numerator: number, n = 12) => ({
    metric_key: 'm',
    metric_version: 1,
    group: 'all',
    suppressed: false as const,
    n,
    numerator,
    denominator: n,
    missing: 0,
    stale: false,
    release_id: 'r',
  });
  const hidden = { metric_key: 'm', metric_version: 1, group: 'all', suppressed: true as const };
  const series = (cells: unknown[]) =>
    ({
      key: 'F14',
      label: 'Brukar MFA',
      n: null,
      buckets: cells.map((c, i) => ({
        id: ['ja', 'nei', 'usikker'][i]!,
        label: `L${i}`,
        score: 0,
        cell: c,
      })),
      mean: null,
      nps: null,
    }) as Parameters<typeof employeeLine>[1];

  it('carries n, each option with its label and count, the short name and the question', () => {
    expect(employeeLine(q, series([cell(7), cell(4), cell(1)]))).toEqual({
      id: 'F14',
      label: 'Spørsmål F14?',
      text: 'Spørsmål F14?',
      multi: false,
      suppressed: false,
      n: 12,
      options: [
        { id: 'ja', label: 'L0', count: 7 },
        { id: 'nei', label: 'L1', count: 4 },
        { id: 'usikker', label: 'L2', count: 1 },
      ],
    });
  });

  it('is hidden as a whole when one option is hidden, with no number left', () => {
    const line = employeeLine(q, series([cell(7), hidden, cell(1)]));
    expect(line).toEqual({
      id: 'F14',
      label: 'Spørsmål F14?',
      text: 'Spørsmål F14?',
      multi: false,
      suppressed: true,
    });
    expect(JSON.stringify(employeeLine(q, series([hidden, hidden, hidden])))).not.toMatch(
      /"(n|count|options)"/,
    );
  });
});
