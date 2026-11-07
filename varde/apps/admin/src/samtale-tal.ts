// The arithmetic of the overview (2.21) that the page does itself: shares, the weakest first, where the
// map leaves a gap between themes, what a cell's tip says. The API counts; these only order and word.
import {
  type Counts,
  type OverviewQuestion,
  type OverviewRow,
  RATING,
  type Rating,
} from './samtale-models.js';

/** Answers on the scale: Ivaretatt, Forbetringspotensial and Manglar («Ikkje aktuelt» is not one). */
export const ratedOf = (c: Counts) => c.ivaretatt + c.forbetring + c.manglar;
/** Whole per cent, 0 when there is nothing to count. */
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
/** The share of Manglar among the rated answers, or null when none are rated. */
export const missing = (c: Counts) => (ratedOf(c) ? c.manglar / ratedOf(c) : null);

/** The weakest points: most Manglar first, then most Forbetringspotensial; nothing rated last. */
export function weakest(questions: readonly OverviewQuestion[]) {
  const share = (c: Counts, k: 'manglar' | 'forbetring') => (ratedOf(c) ? c[k] / ratedOf(c) : -1);
  return [...questions].sort(
    (a, b) =>
      share(b.counts, 'manglar') - share(a.counts, 'manglar') ||
      share(b.counts, 'forbetring') - share(a.counts, 'forbetring') ||
      a.no - b.no,
  );
}

/** Lowest score first, nothing rated last; `name` breaks a tie. */
export function lowestFirst<T extends { score: number | null }>(
  list: readonly T[],
  name: (x: T) => string,
) {
  return [...list].sort(
    (a, b) => (a.score ?? 101) - (b.score ?? 101) || name(a).localeCompare(name(b), 'nn'),
  );
}

/** The rows of the map: weakest first, or by the client's name (then the round). */
export function mapRows(rows: readonly OverviewRow[], order: 'svakast' | 'namn') {
  const named = (r: OverviewRow) => `${r.client.name} ${r.round.name}`;
  return order === 'namn'
    ? [...rows].sort((a, b) => named(a).localeCompare(named(b), 'nn'))
    : lowestFirst(rows, named);
}

/** A conclusion half or more of the clients have is a candidate for a seminar. */
export const seminarTopic = (clients: number, of: number) => of > 0 && clients / of >= 0.5;

/** The columns of the map: one per question, and a narrow gap where a new theme begins. */
export function mapColumns(questions: readonly OverviewQuestion[]) {
  const cols: ({ gap: true } | { gap: false; q: OverviewQuestion })[] = [];
  questions.forEach((q, n) => {
    if (n > 0 && q.section !== questions[n - 1]!.section) cols.push({ gap: true });
    cols.push({ gap: false, q });
  });
  return cols;
}

/** The word of a rating, or «Ikkje vurdert». */
export const word = (r: Rating | null) => (r ? RATING[r].word : 'Ikkje vurdert');

/** What the tip of a cell says: the client and the question, the rating, then the conclusion if one is
 * written, else what the client said. Lines are split by «|». */
export function cellTip(row: OverviewRow, q: OverviewQuestion) {
  const cell = row.cells[q.id];
  const said = cell?.action.trim() ? `Tiltak: ${cell.action.trim()}` : (cell?.answer.trim() ?? '');
  return [`${row.client.name} · ${q.no} ${q.short}`, word(cell?.rating ?? null), said]
    .map((s) => s.replaceAll('|', '/'))
    .join('|');
}
