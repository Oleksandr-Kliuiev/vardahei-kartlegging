// The overview of «Samtalar» (2.21): the finished conversations of one or more rounds on one page, and
// those going on when asked. Per conversation its counts, score and day; per question and per theme the
// counts; per question the conclusions («Konklusjon og tiltak») written and how many clients have one;
// totals for the tiles. Also the CSV of the same choice. Pure functions over rows the service loads.
// Rounds may use different published versions of the guide: questions are matched by their id.
// The rows given here never carry an internal note, so nothing here can pass one on.
// 2.22b: the actions of the catalogue chosen for an answer group the recurring tiltak first, by action
// with its seminar topic; the written conclusions of answers without one are grouped as before.
import { csv } from '../exports/csv.js';
import type { Rating } from './interview-input.js';
import {
  type Counts,
  countRatings,
  type GuideQuestion,
  guideQuestions,
  score,
} from './interview-view.js';

/** An action of the catalogue (3.1) as the overview names it. */
export interface CatalogAction {
  id: string;
  name: string;
  seminar_topic: string;
}
/** One answer as the overview reads it: what the client said, the rating, the conclusion and the actions
 * of the catalogue chosen for it (2.22b). */
export interface CellRow {
  question_id: string;
  rating: string | null;
  answer: string;
  action: string;
  catalog?: readonly CatalogAction[];
}
export interface ConversationRow {
  id: string;
  status: string;
  held_on: Date | null;
  client: { id: string; name: string };
  answers: readonly CellRow[];
}
export interface RoundRow {
  id: string;
  name: string;
  created_at: Date;
  template_version: { id: string; label: string; content: unknown };
  conversations: readonly ConversationRow[];
}

export interface Cell {
  rating: Rating | null;
  answer: string;
  action: string;
}
export interface OverviewQuestion extends GuideQuestion {
  /** The place of the question in the overview, from 1. */
  no: number;
  counts: Counts;
  /** Conversations with a conclusion written to this question. */
  actions: number;
}

const zero = (): Counts => ({ ivaretatt: 0, forbetring: 0, manglar: 0, ikkje_aktuelt: 0, none: 0 });
const add = (to: Counts, c: Counts) => {
  for (const k of Object.keys(to) as (keyof Counts)[]) to[k] += c[k];
};
const day = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10));
const spelling = (s: string) => s.trim().replace(/\s+/g, ' ');
/** Two conclusions are the same when they differ only in spaces, case or a closing full stop. */
const sameText = (s: string) => spelling(s).replace(/\.$/, '').toLowerCase();
/** The order conclusions are read in, so a tie between two spellings always goes the same way: the
 * earliest conversation first. */
const byDay = (a: ConversationRow, b: ConversationRow) =>
  (a.held_on?.getTime() ?? Infinity) - (b.held_on?.getTime() ?? Infinity) ||
  a.client.name.localeCompare(b.client.name, 'nn') ||
  a.id.localeCompare(b.id);

/** One conclusion as many clients wrote it: how many, and the spelling most of them used (on a tie,
 * the earliest one). */
interface Wording {
  clients: number;
  spellings: Map<string, number>;
}
const textOf = (w: Wording) => [...w.spellings].reduce((best, s) => (s[1] > best[1] ? s : best))[0];

/** The questions of every guide in the choice: the newest guide's order first, then questions only an
 * older guide has; a question keeps the words of the newest guide that has it. */
function unionOf(rounds: readonly RoundRow[]) {
  const newest = [...rounds].sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  const byId = new Map<string, GuideQuestion>();
  const own = new Map<string, GuideQuestion[]>();
  for (const r of newest) {
    const questions = guideQuestions(r.template_version.content);
    own.set(r.id, questions);
    for (const q of questions) if (!byId.has(q.id)) byId.set(q.id, q);
  }
  return { questions: [...byId.values()], own };
}

/** The conversations the overview shows: finished, and those going on when asked. */
const shownIn = (r: RoundRow, inProgress: boolean) =>
  r.conversations.filter((c) => c.status === 'done' || (inProgress && c.status === 'in_progress'));

export function overviewOf(rounds: readonly RoundRow[], inProgress: boolean) {
  const { questions, own } = unionOf(rounds);
  const no = new Map(questions.map((q, n) => [q.id, n + 1]));
  const perQuestion = new Map(questions.map((q) => [q.id, { counts: zero(), actions: 0 }]));
  const texts = new Map<string, Map<string, Wording>>();
  const catalog = new Map<string, { action: CatalogAction; talks: Set<string>; qs: Set<string> }>();
  const totals = { counts: zero(), actions: 0 };
  const scores: number[] = [];
  const conversations = rounds
    .flatMap((r) => shownIn(r, inProgress).map((c) => ({ r, c })))
    .sort((a, b) => byDay(a.c, b.c))
    .map(({ r, c }) => {
      const guide = own.get(r.id) ?? [];
      const byId = new Map(c.answers.map((a) => [a.question_id, a]));
      const counts = countRatings(guide, c.answers);
      const cells: Record<string, Cell> = {};
      let actions = 0;
      for (const q of guide) {
        const a = byId.get(q.id);
        const rating = (a?.rating ?? null) as Rating | null;
        const action = a?.action.trim() ?? '';
        cells[q.id] = { rating, answer: a?.answer ?? '', action: a?.action ?? '' };
        const stats = perQuestion.get(q.id)!;
        stats.counts[rating ?? 'none'] += 1;
        for (const x of a?.catalog ?? []) {
          const g = catalog.get(x.id) ?? { action: x, talks: new Set(), qs: new Set() };
          catalog.set(x.id, g);
          g.talks.add(c.id);
          g.qs.add(q.id);
        }
        if (!action) continue;
        actions += 1;
        stats.actions += 1;
        // A conclusion with an action of the catalogue counts under that action, not as a wording.
        if (a?.catalog?.length) continue;
        const group = texts.get(q.id) ?? new Map<string, Wording>();
        texts.set(q.id, group);
        const key = sameText(action);
        const w = group.get(key) ?? { clients: 0, spellings: new Map<string, number>() };
        group.set(key, w);
        w.clients += 1;
        w.spellings.set(spelling(action), (w.spellings.get(spelling(action)) ?? 0) + 1);
      }
      add(totals.counts, counts);
      totals.actions += actions;
      const s = score(counts);
      if (s !== null) scores.push(s);
      return {
        id: c.id,
        status: c.status,
        held_on: day(c.held_on),
        client: c.client,
        round: { id: r.id, name: r.name },
        counts,
        score: s,
        actions,
        cells,
      };
    })
    .sort((a, b) => a.client.name.localeCompare(b.client.name, 'nn') || a.id.localeCompare(b.id));

  const sectionTitles = [...new Set(questions.map((q) => q.section))];
  const all = rounds.flatMap((r) => r.conversations);
  return {
    rounds: rounds.map((r) => ({
      id: r.id,
      name: r.name,
      guide: { id: r.template_version.id, label: r.template_version.label },
      questions: (own.get(r.id) ?? []).map((q) => q.id),
    })),
    in_progress: inProgress,
    questions: questions.map((q): OverviewQuestion => ({
      ...q,
      no: no.get(q.id)!,
      ...perQuestion.get(q.id)!,
    })),
    sections: sectionTitles.map((title) => {
      const ids = questions.filter((q) => q.section === title).map((q) => q.id);
      const counts = zero();
      for (const id of ids) add(counts, perQuestion.get(id)!.counts);
      return { title, questions: ids, counts, score: score(counts) };
    }),
    conversations,
    totals: {
      /** Every conversation of the chosen rounds, those not started too: «18 av 48». */
      conversations: all.length,
      done: all.filter((c) => c.status === 'done').length,
      in_progress: all.filter((c) => c.status === 'in_progress').length,
      shown: conversations.length,
      counts: totals.counts,
      /** The mean of the conversations' scores; a conversation with nothing rated has none. */
      score: scores.length ? Math.round(scores.reduce((n, s) => n + s, 0) / scores.length) : null,
      actions: totals.actions,
    },
    /** The actions of the catalogue chosen (2.22b), the one most conversations have first: in how many
     * conversations (one per client and round) and for which questions, in the order of the overview. */
    catalog: [...catalog.values()]
      .map((g) => ({
        action: g.action,
        clients: g.talks.size,
        questions: [...g.qs].sort((a, b) => no.get(a)! - no.get(b)!),
      }))
      .sort((a, b) => b.clients - a.clients || a.action.name.localeCompare(b.action.name, 'nn')),
    /** Conclusions without an action of the catalogue, per question, the question most clients have one
     * for first; per question the wordings, the one most of them used first. */
    actions: questions
      .filter((q) => texts.has(q.id))
      .map((q) => {
        const wordings = [...texts.get(q.id)!.values()];
        return {
          question: q.id,
          clients: wordings.reduce((n, w) => n + w.clients, 0),
          texts: wordings
            .map((w) => ({ text: textOf(w), clients: w.clients }))
            .sort((a, b) => b.clients - a.clients || a.text.localeCompare(b.text, 'nn')),
        };
      })
      .sort((a, b) => b.clients - a.clients || no.get(a.question)! - no.get(b.question)!),
  };
}
export type Overview = ReturnType<typeof overviewOf>;

export const RATING_WORD: Record<Rating, string> = {
  ivaretatt: 'Ivaretatt',
  forbetring: 'Forbetringspotensial',
  manglar: 'Manglar',
  ikkje_aktuelt: 'Ikkje aktuelt',
};
const STATUS_WORD: Record<string, string> = { done: 'Fullført', in_progress: 'Pågår' };
/** «Passordhandterar; Phishing-øving»: the names of the chosen actions, in alphabetical order. */
export const namesOf = (list: readonly { name: string }[] | undefined) =>
  (list ?? [])
    .map((x) => x.name)
    .sort((a, b) => a.localeCompare(b, 'nn'))
    .join('; ');

/** The CSV of the same choice: one row per question of each conversation's guide, what the client said,
 * the rating, the conclusion and the actions of the catalogue chosen (2.22b). Never an internal note:
 * the rows do not carry one. */
export function overviewCsv(rounds: readonly RoundRow[], inProgress: boolean) {
  const { questions, own } = unionOf(rounds);
  const no = new Map(questions.map((q, n) => [q.id, n + 1]));
  const lines: unknown[][] = [];
  let conversations = 0;
  for (const r of [...rounds].sort((a, b) => a.name.localeCompare(b.name, 'nn'))) {
    const shown = [...shownIn(r, inProgress)].sort((a, b) =>
      a.client.name.localeCompare(b.client.name, 'nn'),
    );
    for (const c of shown) {
      conversations += 1;
      const byId = new Map(c.answers.map((a) => [a.question_id, a]));
      for (const q of own.get(r.id) ?? []) {
        const a = byId.get(q.id);
        lines.push([
          r.name,
          c.client.name,
          day(c.held_on) ?? '',
          STATUS_WORD[c.status] ?? c.status,
          no.get(q.id),
          q.section,
          q.text,
          a?.answer ?? '',
          a?.rating ? (RATING_WORD[a.rating as Rating] ?? '') : '',
          a?.action ?? '',
          namesOf(a?.catalog),
        ]);
      }
    }
  }
  const text = csv(
    [
      'Samtalerunde',
      'Kunde',
      'Dato',
      'Status',
      'Nr',
      'Tema',
      'Spørsmål',
      'Kva kunden sa',
      'Vurdering',
      'Konklusjon og tiltak',
      'Tiltak frå katalogen',
    ],
    lines,
  );
  return { text, conversations, rows: lines.length };
}
