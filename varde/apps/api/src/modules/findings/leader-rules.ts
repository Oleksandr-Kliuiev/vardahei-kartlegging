// Leader-channel rules over the audited leader rows of one client (ADR-021 rule (a), ADR-026): the
// dashboard (LeaderView) and the rule preview (2.5) share this logic, so both read rows the same way.
import type { ViewCell } from '../privacy/privacy.service.js';
import type { FindingRule, FindingView } from './finding-rule.js';

/** One leader response as the audited leader endpoint returns it. */
export interface LeaderAnswers {
  answers: Readonly<Record<string, unknown>>;
}
const values = (v: unknown) => (Array.isArray(v) ? v : [v]).map(String);

/** A simple leader rule: leaders of the client who answered the question, and who matched. */
export function leaderStats(r: FindingRule, rows: readonly LeaderAnswers[]) {
  const q = r.question ?? '';
  const basis = rows.filter((row) => row.answers[q] !== undefined);
  const count = basis.filter((row) =>
    values(row.answers[q]).some((v) => r.raw_options?.includes(v)),
  ).length;
  return { n: basis.length, count };
}

const view = (r: FindingRule, n: number, count: number, share: number, tal: string) => ({
  key: r.key,
  version: r.version,
  channel: 'leader' as const,
  n,
  count,
  share,
  text: r.text.nn,
  action: r.action_text.nn,
  severity: r.severity,
  tal,
  order: r.order,
});

/** A simple leader rule is a signal of the leader, even from one response (§6.2). */
export function leaderFinding(r: FindingRule, rows: readonly LeaderAnswers[]): FindingView | null {
  const { n, count } = leaderStats(r, rows);
  return count ? { ...view(r, n, count, count / n, 'Leiaren'), level: r.level ?? 'medium' } : null;
}

/** The leader's answer selects the cross rule F12 × B13; then the common F12 cell decides. */
export const crossSelected = (cross: FindingRule, rows: readonly LeaderAnswers[]) =>
  rows.some((r) => cross.options.includes(String(r.answers[cross.question ?? 'B13'])));
/** The common cell of the cross rule: the share who know where to report (F12 = ja). */
export const crossCellKey = (cross: FindingRule) => `${cross.metric_key}.ja`;

/** F12 × B13 for one client: the leader's B13 and the common F12 cell under k (ADR-026). */
export function crossFinding(
  cross: FindingRule,
  rows: readonly LeaderAnswers[],
  cell: ViewCell | undefined,
): FindingView | null {
  if (!crossSelected(cross, rows) || !cell || cell.suppressed || !cell.denominator) return null;
  if (cell.n < cross.min_count || cell.numerator / cell.denominator < cross.threshold.medium)
    return null;
  const tal = `${Math.round((100 * cell.numerator) / cell.denominator)} %`;
  return { ...view(cross, cell.denominator, cell.numerator, 0.5, tal), level: 'medium' };
}

/** The cross rule at «alle»: a number of clients, never their names (ADR-026). */
export function crossSummary(cross: FindingRule, count: number): FindingView {
  return { ...view(cross, count, count, 0.5, `${count} kundar`), level: 'medium' };
}

export const byLevel = (a: FindingView, b: FindingView) =>
  (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1) || b.share - a.share || a.order - b.order;
