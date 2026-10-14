// 1.6: display path, leader part, choices_from and prune.
import { describe, expect, it } from 'vitest';
import { optionsFor } from '../src/runner/choices.js';
import { isLeader, prune, visibleQuestions } from '../src/runner/path.js';
import { QUESTIONS, VERSION } from './support/version.js';

const ids = (answers: Record<string, unknown>) =>
  visibleQuestions(VERSION, answers as never).map((q) => q.id);
const T = QUESTIONS.find((q) => q.id === 'T')!;
const M = QUESTIONS.find((q) => q.id === 'M')!;

describe('display path (1.6)', () => {
  it('non-leader: common part only; M hidden with < 2 routine tasks', () => {
    expect(ids({ R: 'kontor', T: ['epost'] })).toEqual(['ID', 'R', 'W', 'T', 'S', 'F', 'N']);
    expect(isLeader(VERSION, { R: 'kontor' })).toBe(false);
  });

  it('leader: the leader part follows, B2 only when B1 = nei', () => {
    expect(ids({ R: 'it', T: ['epost', 'referat'] })).toEqual([
      'ID',
      'R',
      'W',
      'T',
      'M',
      'S',
      'F',
      'N',
      'B1',
    ]);
    expect(ids({ R: 'leiar', B1: 'nei' })).toContain('B2');
    expect(isLeader(VERSION, { R: 'leiar' })).toBe(true);
  });

  it('option.visible_if: practical tasks only for practical work', () => {
    expect(optionsFor(T, { R: 'kontor' }).map((o) => o.id)).toEqual(['epost', 'referat', 'ingen']);
    expect(optionsFor(T, { R: 'kontor', W: ['praktisk'] }).map((o) => o.id)).toContain('timar');
  });

  it('choices_from: only chosen options of the source, the excluded one included as chosen', () => {
    expect(optionsFor(M, { T: ['referat', 'epost'] }).map((o) => o.id)).toEqual([
      'epost',
      'referat',
    ]);
    expect(optionsFor(M, {}).map((o) => o.id)).toEqual([]);
  });

  it('prune drops answers to hidden questions and hidden options', () => {
    const answers = { R: 'kontor', T: ['epost', 'timar'], M: 'timar', B1: 'ja', S: { a: 2 } };
    expect(prune(VERSION, answers)).toEqual({ R: 'kontor', T: ['epost'], S: { a: 2 } });
  });

  it('prune keeps the leader part for leaders and recomputes visibility on pruned answers', () => {
    const answers = { R: 'leiar', T: ['epost', 'referat'], M: 'referat', B1: 'ja', B2: 'x' };
    expect(prune(VERSION, answers)).toEqual({
      R: 'leiar',
      T: ['epost', 'referat'],
      M: 'referat',
      B1: 'ja',
    });
  });
});
