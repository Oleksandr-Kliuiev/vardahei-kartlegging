import type { TemplateContent } from '@varde/schema/template/template';
import type { ViewCell } from '../privacy/privacy.service.js';
import type { FindingRule, FindingView } from './finding-rule.js';

const visible = (c: ViewCell): c is Extract<ViewCell, { suppressed: false }> => !c.suppressed;
export function evaluate(
  rules: readonly FindingRule[],
  cells: readonly ViewCell[],
  content: TemplateContent,
  group: string,
  channel: 'aggregate' | 'leader',
): FindingView[] {
  const own = cells.filter((c) => c.group === group);
  const out: FindingView[] = [];
  for (const r of rules.filter((r) => r.channel === channel && r.computed !== 'f12_b13')) {
    const base = {
      key: r.key,
      version: r.version,
      channel,
      action: r.action_text.nn,
      severity: r.severity,
      order: r.order,
    };
    if (r.computed === 'routine' || r.computed === 'heaviest') {
      const routine = own.find((c) => c.metric_key === 'ki.routine_hours_week');
      if (!routine || !visible(routine)) continue; // old FUNN gates both computed findings on K4
      if (r.computed === 'routine') {
        if (routine.numerator < 1) continue;
        const common = content.questions.find((q) => q.id === 'K3');
        const options = common && 'options' in common ? common.options : [];
        const top = options
          .filter((o) => o.id !== 'ingen')
          .map((o) => ({ o, c: own.find((c) => c.metric_key === `ki.k3.distribution.${o.id}`) }))
          .filter((x) => x.c && visible(x.c))
          .sort(
            (a, b) =>
              (b.c && visible(b.c) ? b.c.numerator : 0) - (a.c && visible(a.c) ? a.c.numerator : 0),
          )[0];
        const task =
          top?.c && visible(top.c) && top.c.numerator > 0
            ? `. Vanlegast: ${top.o.texts.text.nn.toLowerCase()}`
            : '';
        out.push({
          ...base,
          n: routine.n,
          count: routine.numerator,
          share: 2,
          level: 'high',
          tal: `≈ ${Math.round(routine.numerator)} timar/veke`,
          text: r.text.nn.replace('{n}', String(routine.n)) + task,
          ...(routine.release_id ? { release_id: routine.release_id } : {}),
        });
      } else {
        const tasks = own
          .filter((c) => c.metric_key.startsWith(`${r.metric_key}.`) && visible(c))
          .filter(visible)
          .sort((a, b) => b.numerator - a.numerator || b.n - a.n);
        const top = tasks[0];
        if (!top || top.numerator < (r.minimum_hours ?? 1)) continue;
        const task = content.questions.find((q) => q.id === 'K16');
        const label =
          task && 'options' in task
            ? (task.options.find((o) => o.id === top.metric_key.split('.').at(-1))?.texts.text.nn ??
              '')
            : '';
        out.push({
          ...base,
          n: top.n,
          count: top.numerator,
          share: 1.5,
          level: 'high',
          tal: `≈ ${Math.round(top.numerator)} timar/veke`,
          text: r.text.nn
            .replace('{task}', label.toLowerCase())
            .replace('{n}', String(top.n))
            .replace('{persons}', top.n === 1 ? 'person' : 'personar'),
          ...(top.release_id ? { release_id: top.release_id } : {}),
        });
      }
      continue;
    }
    const hits = r.options.map((o) => own.find((c) => c.metric_key === `${r.metric_key}.${o}`));
    const basis = own.find((c) => c.metric_key.startsWith(`${r.basis}.`)) ?? hits[0];
    if (!basis || !visible(basis) || !basis.denominator || hits.some((c) => !c || !visible(c)))
      continue;
    const count = hits.reduce((sum, c) => sum + (c && visible(c) ? c.numerator : 0), 0),
      n = basis.denominator,
      share = count / n;
    // Simple leader rules are signals of the leader, including one response (§6.2).
    if (channel === 'leader' ? count === 0 : count < r.min_count || share < r.threshold.medium)
      continue;
    const level =
      channel === 'leader' ? (r.level ?? 'medium') : share >= r.threshold.high ? 'high' : 'medium';
    out.push({
      ...base,
      n,
      count,
      share,
      level,
      text: r.text.nn,
      tal: `${count} av ${n}${channel === 'leader' ? ' leiarar' : ''}`,
      ...(basis.release_id ? { release_id: basis.release_id } : {}),
    });
  }
  return out.sort(
    (a, b) =>
      (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1) ||
      b.share - a.share ||
      a.order - b.order,
  );
}
