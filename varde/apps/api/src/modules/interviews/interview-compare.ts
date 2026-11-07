// Step 3 of «Samtalar» (decisions 3.1 and 3.2 of 07.11): the criteria of the newest published version of
// a guide, and a repeat conversation set against the client's previous finished one with the same guide.
// Pure functions over what the service has read, shared by the tests. Notes never reach them.
import { countRatings, guideQuestions, type GuideQuestion, score } from './interview-view.js';

const day = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10));

/** The questions of a round's own guide version with the criteria of `newest` (the newest published
 * version of the same guide) for the same question id; the round's own criteria where `newest` has none. */
export function withNewestCriteria(
  own: readonly GuideQuestion[],
  newest: readonly GuideQuestion[],
): GuideQuestion[] {
  const criteria = new Map(newest.map((q) => [q.id, q.criteria]));
  return own.map((q) => ({ ...q, criteria: criteria.get(q.id) ?? q.criteria }));
}

interface Held {
  id: string;
  held_on: Date | null;
  started_at: Date | null;
}
const time = (d: Date | null) => d?.getTime() ?? Infinity;
/** `a` was held before `b`: an earlier day, or the same day and an earlier start. A conversation not held
 * yet comes after every one that was. */
const earlier = (a: Held, b: Held) =>
  time(a.held_on) < time(b.held_on) ||
  (time(a.held_on) === time(b.held_on) && time(a.started_at) < time(b.started_at));

/** «Førre gong»: the latest of `done` held before `current`, never `current` itself. */
export function previousOf<T extends Held>(current: Held, done: readonly T[]): T | null {
  let found: T | null = null;
  for (const d of done)
    if (d.id !== current.id && earlier(d, current) && (found === null || earlier(found, d)))
      found = d;
  return found;
}

/** The scale in order, Manglar < Forbetringspotensial < Ivaretatt; «Ikkje aktuelt» has no place on it. */
const RANK: Partial<Record<string, number>> = { manglar: 0, forbetring: 1, ivaretatt: 2 };

interface Rated {
  question_id: string;
  rating: string | null;
}

/** The questions of `questions`, in their order, rated better or worse now than then. «Ikkje aktuelt» or
 * no rating on either side is no move. */
export function moves(
  questions: readonly { id: string }[],
  then: readonly Rated[],
  now: readonly Rated[],
) {
  const was = new Map(then.map((a) => [a.question_id, RANK[a.rating ?? '']]));
  const is = new Map(now.map((a) => [a.question_id, RANK[a.rating ?? '']]));
  const out = { better: [] as string[], worse: [] as string[] };
  for (const { id } of questions) {
    const a = was.get(id),
      b = is.get(id);
    if (a === undefined || b === undefined || a === b) continue;
    (b > a ? out.better : out.worse).push(id);
  }
  return out;
}

/** What a repeat conversation shows of the previous one: the day, the round, the counts and the score of
 * its own guide version, and per question the rating, what the client said and the conclusion. The
 * caller reads no notes; a question with nothing else written is left out. */
export function previousView(p: {
  id: string;
  held_on: Date | null;
  round: { id: string; name: string; template_version: { content: unknown } };
  answers: readonly {
    question_id: string;
    rating: string | null;
    answer: string;
    action: string;
  }[];
}) {
  const counts = countRatings(guideQuestions(p.round.template_version.content), p.answers);
  return {
    id: p.id,
    held_on: day(p.held_on),
    round: { id: p.round.id, name: p.round.name },
    counts,
    score: score(counts),
    answers: Object.fromEntries(
      p.answers
        .filter((a) => a.rating !== null || a.answer.trim() || a.action.trim())
        .map((a) => [a.question_id, { rating: a.rating, answer: a.answer, action: a.action }]),
    ),
  };
}

export interface Compared extends Held {
  status: string;
  /** The guide of its round: only conversations with the same guide are compared. */
  template: string;
  questions: readonly { id: string }[];
  answers: readonly Rated[];
  score: number | null;
}

/** «Før og etter» on the client page: a finished conversation against the previous finished one with the
 * same guide, with that one's day and score and how many questions moved; null for any other. */
export function changeOf(c: Compared, all: readonly Compared[]) {
  if (c.status !== 'done') return null;
  const prev = previousOf(
    c,
    all.filter((x) => x.status === 'done' && x.template === c.template),
  );
  if (prev === null) return null;
  const moved = moves(c.questions, prev.answers, c.answers);
  return {
    previous: { id: prev.id, held_on: day(prev.held_on), score: prev.score },
    better: moved.better.length,
    worse: moved.worse.length,
  };
}
