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
