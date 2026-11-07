// 2.21: rounds may use different published versions of the guide. The overview matches questions by id:
// a question only one guide has counts only in the rounds of that guide (not as unrated elsewhere), the
// newest guide gives the order and the words, and each conversation counts its own guide's questions.
import { describe, expect, it } from 'vitest';
import {
  overviewCsv,
  overviewOf,
  type RoundRow,
} from '../../src/modules/interviews/interview-overview.js';

const q = (id: string, short: string, section?: string) => ({
  id,
  type: 'text',
  texts: {
    text: { nn: `${short}?` },
    short_label: { nn: short },
    ...(section ? { section_title: { nn: section } } : {}),
  },
});
const round = (
  id: string,
  created: string,
  questions: object[],
  conversations: RoundRow['conversations'],
): RoundRow => ({
  id,
  name: `Runde ${id}`,
  created_at: new Date(created),
  template_version: { id: `v-${id}`, label: id, content: { questions } },
  conversations,
});
const talk = (
  id: string,
  status: string,
  answers: [string, string | null, string?][],
): RoundRow['conversations'][number] => ({
  id,
  status,
  held_on: new Date('2026-11-10T00:00:00Z'),
  client: { id: `k-${id}`, name: `Kunde ${id}` },
  answers: answers.map(([question_id, rating, action = '']) => ({
    question_id,
    rating,
    answer: `Svar ${question_id}`,
    action,
  })),
});

const older = round(
  '1',
  '2026-05-01',
  [q('N2', 'Ansvar', 'Tema A'), q('N3', 'Gammal', 'Tema A')],
  [
    talk('a', 'done', [
      ['N2', 'ivaretatt'],
      ['N3', 'manglar', 'Gjer noko'],
    ]),
    talk('b', 'planned', []),
  ],
);
const newer = round(
  '2',
  '2026-11-01',
  [q('N2', 'Kven har ansvaret', 'Tema A'), q('N4', 'Ny', 'Tema B')],
  [
    talk('c', 'done', [
      ['N2', 'manglar'],
      ['N4', 'forbetring', 'Gjer noko'],
      ['N3', 'ivaretatt'],
    ]),
    talk('d', 'in_progress', [['N2', 'ivaretatt']]),
  ],
);

describe('the overview over guides that differ (2.21)', () => {
  const o = overviewOf([older, newer], false);

  it('takes the newest guide first and the words it has, then what only an older one has', () => {
    expect(o.questions.map((x) => [x.id, x.no, x.short, x.section])).toEqual([
      ['N2', 1, 'Kven har ansvaret', 'Tema A'],
      ['N4', 2, 'Ny', 'Tema B'],
      ['N3', 3, 'Gammal', 'Tema A'],
    ]);
    expect(o.rounds.map((r) => r.questions)).toEqual([
      ['N2', 'N3'],
      ['N2', 'N4'],
    ]);
  });

  it('counts a question only where its guide has it; a conversation counts its own guide', () => {
    const by = (id: string) => o.questions.find((x) => x.id === id)!.counts;
    expect(by('N2')).toEqual({
      ivaretatt: 1,
      forbetring: 0,
      manglar: 1,
      ikkje_aktuelt: 0,
      none: 0,
    });
    expect(by('N3')).toEqual({
      ivaretatt: 0,
      forbetring: 0,
      manglar: 1,
      ikkje_aktuelt: 0,
      none: 0,
    });
    expect(by('N4')).toEqual({
      ivaretatt: 0,
      forbetring: 1,
      manglar: 0,
      ikkje_aktuelt: 0,
      none: 0,
    });
    const c = o.conversations.find((x) => x.id === 'c')!;
    // N3 is not in the newer guide: its answer is left out, as countRatings does.
    expect(c.counts).toEqual({
      ivaretatt: 0,
      forbetring: 1,
      manglar: 1,
      ikkje_aktuelt: 0,
      none: 0,
    });
    expect(Object.keys(c.cells)).toEqual(['N2', 'N4']);
    expect(c.score).toBe(25);
    expect(o.sections).toEqual([
      {
        title: 'Tema A',
        questions: ['N2', 'N3'],
        counts: { ivaretatt: 1, forbetring: 0, manglar: 2, ikkje_aktuelt: 0, none: 0 },
        score: 33,
      },
      {
        title: 'Tema B',
        questions: ['N4'],
        counts: { ivaretatt: 0, forbetring: 1, manglar: 0, ikkje_aktuelt: 0, none: 0 },
        score: 50,
      },
    ]);
    expect(o.totals).toMatchObject({
      conversations: 4,
      done: 2,
      in_progress: 1,
      shown: 2,
      score: 38,
    });
    expect(o.actions.map((a) => [a.question, a.clients])).toEqual([
      ['N4', 1],
      ['N3', 1],
    ]);
  });

  it('the CSV numbers the questions as the overview does and lists only shown conversations', () => {
    const out = overviewCsv([older, newer], true);
    expect(out).toMatchObject({ conversations: 3, rows: 6 });
    expect(out.text).toContain(
      'Runde 1;Kunde a;2026-11-10;Fullført;3;Tema A;Gammal?;Svar N3;Manglar;Gjer noko',
    );
    expect(out.text).toContain(
      'Runde 2;Kunde d;2026-11-10;Pågår;1;Tema A;Kven har ansvaret?;Svar N2;Ivaretatt;',
    );
    expect(out.text).not.toContain('Kunde b');
  });
});

describe('the wording of a conclusion many wrote (2.21)', () => {
  const on = (id: string, day: string, action: string) => ({
    ...talk(id, 'done', [['N2', 'manglar', action]]),
    held_on: new Date(`${day}T00:00:00Z`),
  });
  const guide = [q('N2', 'Ansvar', 'Tema A')];

  it('is the spelling most used, and on a tie the earliest conversation’s, whatever the order read', () => {
    const late = on('x', '2026-11-12', 'peik ut ein ansvarleg.');
    const early = on('y', '2026-11-10', 'Peik ut ein  ansvarleg');
    for (const list of [
      [late, early],
      [early, late],
    ])
      expect(overviewOf([round('1', '2026-11-01', guide, list)], false).actions).toEqual([
        { question: 'N2', clients: 2, texts: [{ text: 'Peik ut ein ansvarleg', clients: 2 }] },
      ]);
    const third = on('z', '2026-11-14', 'peik ut ein ansvarleg.');
    expect(
      overviewOf([round('1', '2026-11-01', guide, [early, late, third])], false).actions[0]!.texts,
    ).toEqual([{ text: 'peik ut ein ansvarleg.', clients: 3 }]);
  });
});
