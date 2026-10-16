// Two rounds side by side (1.29 with round 1, 3.9 before and after a seminar): the change of a
// mean or share, the score figures of a group, and whether a question and a metric may be compared
// at all (ADR-020 `comparability`, ADR-005 `anchor_key`). Only cells privacy let out come in here.
import type { MetricDefinition } from '@varde/schema/metrics/metric-definition';
import type { Question } from '@varde/schema/template/question';
import type { ViewCell } from '../privacy/privacy.service.js';
import { cellAt, valueOf } from './aggregate-view.js';

export function change(before: number | null, now: number | null, percent = false) {
  if (before === null || now === null) return null;
  const delta = now - before,
    points = Math.round(delta * 100);
  return {
    delta: percent ? points : delta,
    kind: (percent ? points === 0 : Math.abs(delta) < 0.05)
      ? 'likt'
      : delta < 0
        ? 'betre'
        : 'verre',
  };
}
export type Change = ReturnType<typeof change>;

/** Snittscore, kritisk andel, sone and n of one group: `<prefix>.<kind>.<suffix>` cells. */
export function scoreStats(
  cells: readonly ViewCell[],
  prefix: string,
  suffix = 'all',
  group = 'all',
) {
  const c = cellAt(cells, `${prefix}.mean_score.${suffix}`, group);
  return {
    mean: valueOf(c),
    critical: valueOf(cellAt(cells, `${prefix}.critical_share.${suffix}`, group)),
    zone: valueOf(cellAt(cells, `${prefix}.zone.${suffix}`, group)),
    n: c && !c.suppressed ? c.n : null,
  };
}
export type ScoreStats = ReturnType<typeof scoreStats>;

export function pairRow(id: string, label: string, before: ScoreStats, now: ScoreStats) {
  return {
    id,
    label,
    before,
    now,
    change: change(before.mean, now.mean),
    critical_change: change(before.critical, now.critical, true),
  };
}

export type Degree = 'comparable' | 'approximate' | 'incomparable';
export interface Comparable {
  degree: Degree;
  note: string;
}
export const SAME: Comparable = {
  degree: 'comparable',
  note: 'Same spørsmål og same utrekning i begge undersøkingane.',
};
const NO_METRIC: Comparable = {
  degree: 'incomparable',
  note: 'Utrekninga finst berre i den eine undersøkinga.',
};
const NO_LINK: Comparable = {
  degree: 'incomparable',
  note: 'Utrekninga er ulik i dei to undersøkingane, og det er ikkje avtalt at dei kan samanliknast.',
};
const ORDER: Degree[] = ['comparable', 'approximate', 'incomparable'];

/** The worse of two (comparable < approximate < incomparable); the first note of the worst. */
export function worst(...all: Comparable[]): Comparable {
  return all.reduce((a, b) => (ORDER.indexOf(b.degree) > ORDER.indexOf(a.degree) ? b : a), SAME);
}

/** Comparability of the metric used before and the one used after (ADR-020): the same definition,
 * or an explicit `comparability` entry of one of them naming the other `key@version`. */
export function metricLink(before?: MetricDefinition, after?: MetricDefinition): Comparable {
  if (!before && !after)
    return { degree: 'incomparable', note: 'Det finst inga utrekning for dette spørsmålet.' };
  if (!before || !after) return NO_METRIC;
  if (before.key === after.key && before.version === after.version) return SAME;
  const named = (from: MetricDefinition, to: MetricDefinition) =>
    from.comparability.find((c) => c.to === `${to.key}@${to.version}`);
  const link = named(after, before) ?? named(before, after);
  return link ? { degree: link.degree, note: link.note } : NO_LINK;
}

const options = (q: Question) =>
  'options' in q ? q.options.map((o) => `${o.id}:${o.score ?? ''}`).join('|') : '';

/** Why the same question cannot be compared between two versions, or null when it can: a new
 * anchor (ADR-005 `semantic`), another type or other answer options or scores; without anchors a
 * changed wording too (an orthographic fix of an anchored question keeps its anchor). */
export function questionChange(before: Question, after: Question): string | null {
  if (before.anchor_key && after.anchor_key && before.anchor_key !== after.anchor_key)
    return 'Spørsmålet har fått nytt innhald sidan undersøkinga før.';
  if (before.type !== after.type) return 'Spørsmålet har fått ein annan type svar.';
  if ('options' in before && 'options' in after) {
    const ids = (q: typeof before) => q.options.map((o) => o.id).join('|');
    if (ids(before) !== ids(after)) return 'Svaralternativa er endra.';
    if (options(before) !== options(after)) return 'Poenga for svara er endra.';
  }
  if (!(before.anchor_key && after.anchor_key) && before.texts.text.nn !== after.texts.text.nn)
    return 'Ordlyden i spørsmålet er endra.';
  return null;
}
