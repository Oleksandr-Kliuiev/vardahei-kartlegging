// What one rule makes of the input the dashboard sees (2.5 preview): the same evaluation as the
// dashboard, plus the numbers behind «no finding». A suppressed input cell gives no numbers at all.
import type { TemplateContent } from '@varde/schema/template/template';
import type { ViewCell } from '../privacy/privacy.service.js';
import { evaluate, simpleInput } from './evaluate.js';
import type { FindingRule, FindingView } from './finding-rule.js';
import {
  crossFinding,
  crossSelected,
  leaderFinding,
  leaderStats,
  type LeaderAnswers,
} from './leader-rules.js';

export type Outcome =
  | { kind: 'finding'; level: 'medium' | 'high'; tal: string; share: number | null }
  | { kind: 'none'; tal: string | null; share: number | null }
  | { kind: 'hidden' | 'empty' };

const finding = (f: FindingView, share: number | null, tal = f.tal): Outcome => ({
  kind: 'finding',
  level: f.level,
  tal,
  share,
});

/** A rule over view cells of one group: the dashboard cells, or `leaders_all` for leader rules. */
export function explainCells(
  rule: FindingRule,
  cells: readonly ViewCell[],
  content: TemplateContent,
  group: string,
): Outcome {
  const [f] = evaluate([rule], cells, content, group, rule.channel);
  const own = cells.filter((c) => c.group === group);
  if (rule.computed === 'routine' || rule.computed === 'heaviest') {
    if (f) return finding(f, null);
    const routine = own.find((c) => c.metric_key === 'ki.routine_hours_week');
    if (!routine) return { kind: 'empty' };
    return routine.suppressed ? { kind: 'hidden' } : { kind: 'none', tal: null, share: null };
  }
  const input = simpleInput(rule, own);
  if (input.state !== 'visible') return { kind: input.state };
  const tal = `${input.count} av ${input.n}${rule.channel === 'leader' ? ' leiarar' : ''}`;
  return f ? finding(f, input.share, tal) : { kind: 'none', tal, share: input.share };
}

const leaders = (count: number, n: number) => `${count} av ${n} ${n === 1 ? 'leiar' : 'leiarar'}`;

/** A leader rule over the audited leader rows of one client; F12 × B13 also reads the F12 cell. */
export function explainLeader(
  rule: FindingRule,
  rows: readonly LeaderAnswers[],
  f12: ViewCell | undefined,
): Outcome {
  if (rule.computed === 'f12_b13') {
    if (!crossSelected(rule, rows))
      return { kind: 'none', tal: 'Leiaren har ikkje valt desse svara', share: null };
    if (!f12) return { kind: 'empty' };
    if (f12.suppressed) return { kind: 'hidden' };
    const share = f12.denominator ? f12.numerator / f12.denominator : null;
    const tal = `${f12.numerator} av ${f12.denominator}`;
    const f = crossFinding(rule, rows, f12);
    return f ? finding(f, share, tal) : { kind: 'none', tal, share };
  }
  const { n, count } = leaderStats(rule, rows);
  if (!n) return { kind: 'empty' };
  const f = leaderFinding(rule, rows);
  return f
    ? finding(f, count / n, leaders(count, n))
    : { kind: 'none', tal: leaders(count, n), share: count / n };
}

/** F12 × B13 at «alle»: the number of clients where it holds, never which (ADR-026). */
export function explainClients(count: number): Outcome {
  const tal = `${count} ${count === 1 ? 'kunde' : 'kundar'}`;
  return count
    ? { kind: 'finding', level: 'medium', tal, share: null }
    : { kind: 'none', tal, share: null };
}
