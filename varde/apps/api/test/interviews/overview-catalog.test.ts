// 2.22b: the recurring tiltak of the overview grouped by the action of the catalogue first. One
// conversation counts once per action, also when it chose the action for several questions; the questions
// come in the order of the overview; a conclusion with an action of the catalogue is no wording of its
// own, one without stays a wording; the CSV names the actions in alphabetical order.
import { describe, expect, it } from 'vitest';
import {
  type CatalogAction,
  overviewCsv,
  overviewOf,
  type RoundRow,
} from '../../src/modules/interviews/interview-overview.js';
import { parseCsv } from '../support/csv.js';

const q = (id: string, short: string) => ({
  id,
  type: 'text',
  texts: { text: { nn: `${short}?` }, short_label: { nn: short }, section_title: { nn: 'Tema' } },
});
const phishing: CatalogAction = { id: 'a1', name: 'Phishing-øving', seminar_topic: 'Svindel' };
const passord: CatalogAction = { id: 'a2', name: 'Passordhandterar', seminar_topic: 'Passord' };
const answer = (
  question_id: string,
  action: string,
  catalog: CatalogAction[] = [],
): RoundRow['conversations'][number]['answers'][number] => ({
  question_id,
  rating: 'manglar',
  answer: `Svar ${question_id}`,
  action,
  catalog,
});
const talk = (
  id: string,
  answers: RoundRow['conversations'][number]['answers'],
  status = 'done',
): RoundRow['conversations'][number] => ({
  id,
  status,
  held_on: new Date('2026-11-10T00:00:00Z'),
  client: { id: `k-${id}`, name: `Kunde ${id}` },
  answers,
});
const round: RoundRow = {
  id: 'r',
  name: 'Haust',
  created_at: new Date('2026-11-01'),
  template_version: {
    id: 'v',
    label: 'v1',
    content: { questions: [q('N2', 'Ansvar'), q('N3', 'Opplæring'), q('N4', 'E-post')] },
  },
  conversations: [
    // a: «Phishing-øving» for two questions, once with a conclusion; a wording of its own for N2.
    talk('a', [
      answer('N2', 'Peik ut ein ansvarleg'),
      answer('N3', 'Kurs for alle', [phishing]),
      answer('N4', '', [phishing, passord]),
    ]),
    // b: «Passordhandterar» for N2 without a conclusion; the same wording for N2 as a.
    talk('b', [answer('N2', 'peik ut ein ansvarleg.', [passord]), answer('N4', 'Reglar')]),
    // c: going on, so out of a view of finished conversations only.
    talk('c', [answer('N3', '', [phishing])], 'in_progress'),
  ],
};

describe('the recurring tiltak by action of the catalogue (2.22b)', () => {
  it('counts a conversation once per action, lists its questions in order and sorts by how many', () => {
    const o = overviewOf([round], false);
    expect(o.catalog).toEqual([
      { action: passord, clients: 2, questions: ['N2', 'N4'] },
      { action: phishing, clients: 1, questions: ['N3', 'N4'] },
    ]);
    // With the one going on, «Phishing-øving» has two conversations: a tie is broken by the name.
    expect(overviewOf([round], true).catalog.map((g) => [g.action.name, g.clients])).toEqual([
      ['Passordhandterar', 2],
      ['Phishing-øving', 2],
    ]);
  });

  it('keeps the wordings of conclusions without an action; one with an action counts under it', () => {
    const o = overviewOf([round], false);
    // b's N2 has an action: its text is no wording; a's N2 has none and stays one.
    expect(o.actions).toEqual([
      { question: 'N2', clients: 1, texts: [{ text: 'Peik ut ein ansvarleg', clients: 1 }] },
      { question: 'N4', clients: 1, texts: [{ text: 'Reglar', clients: 1 }] },
    ]);
    // The conclusions written still count all four, the tile «Tiltak skrivne».
    expect(o.totals.actions).toBe(4);
    expect(o.questions.find((x) => x.id === 'N3')?.actions).toBe(1);
  });

  it('without any action of the catalogue the overview is as in 2.21', () => {
    const plain: RoundRow = {
      ...round,
      conversations: round.conversations.map((c) => ({
        ...c,
        answers: c.answers.map((a) => ({ ...a, catalog: [] })),
      })),
    };
    const o = overviewOf([plain], false);
    expect(o.catalog).toEqual([]);
    expect(o.actions.find((a) => a.question === 'N2')).toEqual({
      question: 'N2',
      clients: 2,
      texts: [{ text: 'Peik ut ein ansvarleg', clients: 2 }],
    });
  });

  it('the CSV names the actions of each answer in alphabetical order, in a column of its own', () => {
    const rows = parseCsv(overviewCsv([round], false).text);
    expect(rows[0]!.slice(-2)).toEqual(['Konklusjon og tiltak', 'Tiltak frå katalogen']);
    const cell = (client: string, question: string) =>
      rows.find((r) => r[1] === `Kunde ${client}` && r[6] === `${question}?`)!.slice(-2);
    expect(cell('a', 'E-post')).toEqual(['', 'Passordhandterar; Phishing-øving']);
    expect(cell('a', 'Opplæring')).toEqual(['Kurs for alle', 'Phishing-øving']);
    expect(cell('b', 'E-post')).toEqual(['Reglar', '']);
  });
});
