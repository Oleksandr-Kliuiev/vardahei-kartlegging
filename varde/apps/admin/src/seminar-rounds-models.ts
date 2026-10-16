// Shapes of a seminar's rounds (3.8): the card «Rundar» (GET /api/admin/seminars/:id/rounds) and
// the small texts of its steps. Counts come from the progress of each round, as on «Rundar».
import type { Progress, Version } from './models.js';

export interface RoundStep {
  id: string;
  name: string;
  type: string;
  status: string;
  template: string | null;
  opened_at: string | null;
  closed_at: string | null;
  /** Round clients that are on the seminar (the others are only counted). */
  round_clients: {
    id: string;
    client_id: string;
    name: string;
    status: string;
    population: number | null;
    deadline: string | null;
  }[];
  others: number;
}
export interface RoundChoice {
  id: string;
  name: string;
  status: string;
  /** Clients of the seminar in the round. */
  shared: number;
}
export interface SeminarRounds {
  before: RoundStep | null;
  live: { id: string; status: string } | null;
  after: RoundStep | null;
  choices: { before: RoundChoice[]; after: RoundChoice[] };
  versions: Version[];
}
export type Slot = 'before' | 'after';

export const ROUND_STATE: Record<string, [string, string]> = {
  draft: ['Ikkje opna', 'chip'],
  open: ['Open', 'chip ok'],
  closed: ['Avslutta', 'chip warn'],
  archived: ['Arkivert', 'chip'],
};

/** «12 svar av 20» for the seminar's clients of one round: exact counts, as «Rundar» shows them. */
export function answered(step: RoundStep, progress: Progress[] | undefined) {
  if (!progress) return null;
  const rows = step.round_clients.map((rc) => ({
    name: rc.name,
    n: progress.find((p) => p.round_client_id === rc.id)?.responses_total ?? 0,
    of: rc.population,
  }));
  const n = rows.reduce((s, r) => s + r.n, 0);
  const of = rows.every((r) => r.of !== null) ? rows.reduce((s, r) => s + (r.of ?? 0), 0) : null;
  return {
    total: `${n} svar${of !== null ? ` av ${of}` : ''}`,
    per: rows.map((r) => `${r.name} ${r.n}${r.of !== null ? ` av ${r.of}` : ''}`).join(' · '),
  };
}

/** The state of the live poll in a few words: made, started, open now or done. */
export function liveState(questions: { state: string }[] | null): [string, string] {
  if (questions === null) return ['Ikkje laga', 'chip'];
  if (questions.some((q) => q.state === 'open')) return ['Ope no', 'chip ok'];
  if (questions.every((q) => q.state === 'waiting')) return ['Ikkje starta', 'chip'];
  if (questions.every((q) => q.state === 'released')) return ['Ferdig', 'chip warn'];
  return ['I gang', 'chip ok'];
}

/** «Før og etter» (3.9, GET /api/admin/seminars/:id/before-after): class aggregate from privacy. */
export type Degree = 'comparable' | 'approximate' | 'incomparable';
export interface Comparable {
  degree: Degree;
  note: string;
}
export type Change = { delta: number; kind: string } | null;
/** One side of a question: the answered count and the share per option; null where hidden. */
export interface Bars {
  n: number | null;
  shares: (number | null)[];
}
export interface ScorePair {
  comparable: Comparable;
  before: { mean: number | null; critical: number | null } | null;
  after: { mean: number | null; critical: number | null } | null;
  change: Change;
  critical_change: Change;
}
export interface QuestionPair {
  id: string;
  label: string;
  text: string;
  multi: boolean;
  comparable: Comparable;
  options: { id: string; label: string }[];
  before: Bars | null;
  after: Bars | null;
  score: ScorePair | null;
}
export interface Side {
  respondents: number | null;
  mean: number | null;
  critical: number | null;
}
export interface PairRow {
  before: Side;
  after: Side;
  change: Change;
  critical_change: Change;
}
export interface RoundInfo {
  id: string;
  name: string;
  status: string;
  source: 'released' | 'live';
}
export type BeforeAfter =
  | {
      class: 'aggregate';
      caveats: string[];
      ready: false;
      missing: { before: boolean; after: boolean };
    }
  | {
      class: 'aggregate';
      caveats: string[];
      ready: true;
      rounds: { before: RoundInfo; after: RoundInfo };
      client: string | null;
      cohort: { slug: string; name: string }[];
      not_both: { name: string; before: boolean; after: boolean }[];
      total: PairRow & { comparable: Comparable | null };
      clients: (PairRow & { slug: string; name: string })[];
      questions: QuestionPair[];
      only_before: string[];
      only_after: string[];
    };

export const DEGREE: Record<Degree, string> = {
  comparable: 'Kan samanliknast',
  approximate: 'Omtrent samanliknbart',
  incomparable: 'Kan ikkje samanliknast',
};

/** «12 svar»; a hidden group (below k, or one that could give a small group away) has no number. */
export const svar = (n: number | null) => (n === null ? 'talet er skjult' : `${n} svar`);

export const HIDDEN_NOTE =
  'Grupper med færre enn tre svar, og grupper som kan røpe ei lita gruppe, blir ikkje viste.';

/** «−0,94, betre» or «−43 poeng, betre»; «likt» within the rounding of the dashboard. */
export function changeText(c: Change, points = false): string {
  if (!c) return '';
  if (c.kind === 'likt') return 'likt';
  const size = points
    ? `${Math.abs(c.delta)} poeng`
    : Math.abs(c.delta).toFixed(2).replace('.', ',');
  return `${c.delta > 0 ? '+' : '−'}${size}, ${c.kind}`;
}

/** Where a client of the seminar is missing: «berre før», «berre etter» or «ingen svar». */
export const whereMissing = (c: { before: boolean; after: boolean }) =>
  c.before ? 'svarte berre før' : c.after ? 'svarte berre etter' : 'har ikkje svart';
