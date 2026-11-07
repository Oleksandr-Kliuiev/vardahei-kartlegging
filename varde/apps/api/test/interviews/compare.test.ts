// Step 3 of Samtalar (3.1, 3.2): the criteria of the newest guide version, «førre gong» and the
// questions that moved, as pure functions (interview-compare.ts); the service is tested on Postgres.
import { describe, expect, it } from 'vitest';
import {
  changeOf,
  type Compared,
  moves,
  previousOf,
  previousView,
  withNewestCriteria,
} from '../../src/modules/interviews/interview-compare.js';
import { type GuideQuestion, guideQuestions } from '../../src/modules/interviews/interview-view.js';

const q = (id: string, criteria: GuideQuestion['criteria']): GuideQuestion => ({
  id,
  section: '',
  short: id,
  text: `${id}?`,
  help: null,
  criteria,
});
const c = (ivaretatt: string) => ({ ivaretatt, forbetring: null, manglar: null });
const held = (id: string, day: string | null, start = '08:00') => ({
  id,
  held_on: day === null ? null : new Date(`${day}T00:00:00Z`),
  started_at: day === null ? null : new Date(`${day}T${start}:00Z`),
});
const rated = (pairs: Record<string, string | null>) =>
  Object.entries(pairs).map(([question_id, rating]) => ({ question_id, rating }));

describe('criteria of a guide', () => {
  it('reads the three texts of a question; none, or only blanks, is null', () => {
    const [a, b, d] = guideQuestions({
      questions: [
        {
          id: 'N2',
          texts: {
            text: { nn: 'Kven?' },
            criteria_ivaretatt: { nn: ' Éin ansvarleg. ' },
            criteria_manglar: { nn: 'Ingen.' },
          },
        },
        { id: 'N3', texts: { text: { nn: 'Kva?' } } },
        { id: 'N4', texts: { text: { nn: 'Kor?' }, criteria_forbetring: { nn: '  ' } } },
      ],
    });
    expect(a?.criteria).toEqual({
      ivaretatt: 'Éin ansvarleg.',
      forbetring: null,
      manglar: 'Ingen.',
    });
    expect(b?.criteria).toBeNull();
    expect(d?.criteria).toBeNull();
  });

  it('come from the newest version for the same question id, else from the round’s own', () => {
    const own = [q('N2', c('gammal')), q('N3', c('berre i runda')), q('N4', null)];
    const newest = [q('N2', c('ny')), q('N3', null), q('N5', c('nytt spørsmål'))];
    expect(
      withNewestCriteria(own, newest).map((x) => [x.id, x.criteria?.ivaretatt ?? null]),
    ).toEqual([
      ['N2', 'ny'],
      ['N3', 'berre i runda'],
      ['N4', null],
    ]);
    // No newer version at all: the round's own.
    expect(withNewestCriteria(own, [])).toEqual(own);
  });
});

describe('the previous conversation', () => {
  const now = held('now', '2026-11-10', '09:00');
  it('is the latest finished one held before, never the conversation itself or a later one', () => {
    const done = [
      held('may', '2026-05-04'),
      held('june', '2026-06-01'),
      held('later', '2026-12-01'),
      held('now', '2026-11-10', '09:00'),
    ];
    expect(previousOf(now, done)?.id).toBe('june');
    expect(previousOf(held('june', '2026-06-01'), done)?.id).toBe('may');
    expect(previousOf(held('may', '2026-05-04'), done)).toBeNull();
    expect(previousOf(now, [])).toBeNull();
  });

  it('on the same day the earlier start counts; one not held yet comes after all', () => {
    const done = [held('morning', '2026-11-10', '07:00'), held('noon', '2026-11-10', '12:00')];
    expect(previousOf(now, done)?.id).toBe('morning');
    expect(previousOf(held('planned', null), done)?.id).toBe('noon');
  });

  it('shows the day, the round, counts and per question what was said, never more', () => {
    const v = previousView({
      ...held('may', '2026-05-04'),
      round: {
        id: 'r1',
        name: 'Vår 2026',
        template_version: {
          content: {
            questions: ['N2', 'N3', 'N4', 'N5'].map((id) => ({ id, texts: { text: { nn: id } } })),
          },
        },
      },
      answers: [
        { question_id: 'N2', rating: 'forbetring', answer: 'Dagleg leiar', action: 'Peik ut' },
        { question_id: 'N3', rating: 'ivaretatt', answer: '', action: '' },
        // A note was all this row had: nothing of it is shown.
        { question_id: 'N4', rating: null, answer: '', action: '  ' },
      ],
    });
    expect(v).toEqual({
      id: 'may',
      held_on: '2026-05-04',
      round: { id: 'r1', name: 'Vår 2026' },
      counts: { ivaretatt: 1, forbetring: 1, manglar: 0, ikkje_aktuelt: 0, none: 2 },
      score: 75,
      answers: {
        N2: { rating: 'forbetring', answer: 'Dagleg leiar', action: 'Peik ut' },
        N3: { rating: 'ivaretatt', answer: '', action: '' },
      },
    });
  });
});

describe('questions that moved', () => {
  const questions = ['N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8'].map((id) => ({ id }));
  it('better and worse follow Manglar < Forbetringspotensial < Ivaretatt, in the guide’s order', () => {
    const then = rated({
      N2: 'manglar',
      N3: 'ivaretatt',
      N4: 'forbetring',
      N5: 'forbetring',
      N6: 'ikkje_aktuelt',
      N7: null,
      N8: 'manglar',
    });
    const now = rated({
      N8: 'forbetring',
      N2: 'ivaretatt',
      N3: 'forbetring',
      N4: 'forbetring',
      N5: 'ikkje_aktuelt',
      N6: 'ivaretatt',
      N7: 'manglar',
    });
    // «Ikkje aktuelt» or no rating on either side is no move; the same rating is none either.
    expect(moves(questions, then, now)).toEqual({ better: ['N2', 'N8'], worse: ['N3'] });
    expect(moves(questions, [], now)).toEqual({ better: [], worse: [] });
  });

  it('on the client page: a finished conversation against the previous finished one, same guide', () => {
    const row = (
      id: string,
      day: string,
      status: string,
      template: string,
      r: Record<string, string>,
    ): Compared => ({
      ...held(id, day),
      status,
      template,
      questions,
      answers: rated(r),
      score: id.length,
    });
    const all = [
      row('autumn', '2026-11-10', 'done', 'g1', { N2: 'ivaretatt', N3: 'manglar' }),
      row('going', '2026-12-01', 'in_progress', 'g1', { N2: 'manglar' }),
      row('other-guide', '2026-09-01', 'done', 'g2', { N2: 'manglar' }),
      row('spring', '2026-05-04', 'done', 'g1', { N2: 'forbetring', N3: 'forbetring' }),
    ];
    expect(changeOf(all[0]!, all)).toEqual({
      previous: { id: 'spring', held_on: '2026-05-04', score: 6 },
      better: 1,
      worse: 1,
    });
    // Not finished, or nothing finished before it with that guide: no change to show.
    expect(changeOf(all[1]!, all)).toBeNull();
    expect(changeOf(all[2]!, all)).toBeNull();
    expect(changeOf(all[3]!, all)).toBeNull();
  });
});
