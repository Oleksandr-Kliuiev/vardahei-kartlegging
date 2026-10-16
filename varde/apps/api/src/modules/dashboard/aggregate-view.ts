import { FindingsService } from '../findings/findings.service.js';
import { Injectable } from '@nestjs/common';
import type { Question } from '@varde/schema/template/question';
import { PrivacyService, type ViewCell } from '../privacy/privacy.service.js';
import { DashboardContext, type DashboardScope } from './dashboard-context.js';

export const valueOf = (c: ViewCell | undefined) =>
  !c || c.suppressed || !c.denominator ? null : c.numerator / c.denominator;
export const labelOf = (q: Question) => q.texts.short_label?.nn ?? q.texts.text.nn;
export function cellAt(cells: readonly ViewCell[], key: string, group = 'all') {
  return cells.find((c) => c.metric_key === key && c.group === group);
}

export function questionViews(
  scope: DashboardScope,
  cells: readonly ViewCell[],
  group: string,
  part: 'common' | 'leader',
) {
  const { content, defs } = scope;
  return content.questions
    .filter((q) => q.part === part && !q.identifier && q.type !== 'text')
    .map((q) => {
      const distributions = defs.filter(
        (d) =>
          d.kind === 'distribution' &&
          d.scale !== 'answer_categories' &&
          d.questions[0]?.key.split('.')[0] === q.id,
      );
      const series = distributions.map((d) => {
        const key = d.questions[0]!.key;
        const rowId = key.split('.')[1];
        const label =
          q.type === 'scale'
            ? (q.rows.find((r) => r.id === rowId)?.texts.text.nn ?? 'Svar')
            : labelOf(q);
        const options =
          q.type === 'single' || q.type === 'multi'
            ? q.options.map((o) => ({ id: o.id, label: o.texts.text.nn, score: o.score ?? null }))
            : [...new Set(Object.values(d.options_mapping[key] ?? {}))].map((id) => ({
                id: String(id),
                label: String(id),
                score: null,
              }));
        const buckets = options.map((o) => ({
          ...o,
          cell: cellAt(cells, `${d.key}.${o.id}`, group) ?? {
            metric_key: `${d.key}.${o.id}`,
            metric_version: d.version,
            group,
            suppressed: true as const,
          },
        }));
        const complete = buckets.every((b) => !b.cell.suppressed);
        const n =
          complete && buckets[0] && !buckets[0].cell.suppressed
            ? buckets[0].cell.denominator
            : null;
        const mean =
          complete && n
            ? buckets.reduce(
                (sum, b) => sum + (b.cell.suppressed ? 0 : Number(b.id) * b.cell.numerator),
                0,
              ) / n
            : null;
        const nps =
          q.type === 'nps' && complete && n
            ? Math.round(
                (100 *
                  buckets.reduce(
                    (sum, b) =>
                      sum +
                      (b.cell.suppressed
                        ? 0
                        : (Number(b.id) >= 9 ? 1 : Number(b.id) <= 6 ? -1 : 0) * b.cell.numerator),
                    0,
                  )) /
                  n,
              )
            : null;
        return {
          key,
          label,
          n,
          buckets,
          mean: q.type === 'scale' || q.type === 'nps' ? mean : null,
          nps,
        };
      });
      return { id: q.id, type: q.type, label: q.texts.text.nn, short_label: labelOf(q), series };
    });
}

@Injectable()
export class AggregateView {
  constructor(
    private readonly context: DashboardContext,
    private readonly privacy: PrivacyService,
    private readonly findings: FindingsService,
  ) {}
  async load(round: string, client?: string, role?: string) {
    const scope = await this.context.load(round, client);
    const { content, defs } = scope;
    const common = defs.filter((d) => d.part === 'common');
    const cells = await this.privacy.viewCells(
      round,
      scope.client ? 'round_client' : 'all_clients',
      common,
      scope.client,
    );
    const roleQ = content.questions.find((q) => q.role);
    const roleDefs = common.find(
      (d) => d.questions[0]?.key === roleQ?.id && d.kind === 'distribution',
    );
    const marker = roleDefs
      ? `${roleDefs.key}.${Object.values(roleDefs.options_mapping[roleQ!.id] ?? {})[0]}`
      : '';
    const roles =
      roleQ && 'options' in roleQ
        ? roleQ.options
            .map((o) => ({
              id: o.id,
              label: o.texts.text.nn.split('/')[0]!.split(' eller ')[0]!.trim(),
              cell: cellAt(cells, marker, `role:${o.id}`),
            }))
            .filter((o) => o.cell && !o.cell.suppressed)
            .map((o) => ({ id: o.id, label: o.label }))
        : [];
    const selectedRole = role && role !== 'alle' ? role : undefined;
    const group = selectedRole ? `role:${selectedRole}` : 'all';
    // An absent/hidden role never resolves back to total or bypasses the k filter.
    const selectedCells = selectedRole && !roles.some((r) => r.id === selectedRole) ? [] : cells;
    const prefix = content.key;
    const stats = (input: readonly ViewCell[], g: string, suffix = 'all') => ({
      mean: valueOf(cellAt(input, `${prefix}.mean_score.${suffix}`, g)),
      critical: valueOf(cellAt(input, `${prefix}.critical_share.${suffix}`, g)),
      zone: valueOf(cellAt(input, `${prefix}.zone.${suffix}`, g)),
      n: (() => {
        const c = cellAt(input, `${prefix}.mean_score.${suffix}`, g);
        const population = suffix === 'all' ? cellAt(input, marker, g) : undefined;
        if (population && !population.suppressed) return population.n + population.missing;
        return c && !c.suppressed ? c.n + (suffix === 'all' ? c.missing : 0) : null;
      })(),
    });
    const scored = content.questions.filter(
      (q) => 'options' in q && q.options.some((o) => o.score !== undefined),
    );
    const roleClients =
      selectedRole && !scope.client && roles.some((r) => r.id === selectedRole)
        ? await this.privacy.roleClientCells(round, common, selectedRole)
        : [];
    const grid = [];
    if (scope.client) {
      for (const r of roles.filter((r) => !selectedRole || r.id === selectedRole))
        grid.push({
          id: r.id,
          label: r.label,
          ...stats(selectedCells, `role:${r.id}`),
          questions: scored.map((q) => ({
            id: q.id,
            label: labelOf(q),
            ...stats(selectedCells, `role:${r.id}`, q.id),
          })),
        });
    } else
      for (const c of scope.clients) {
        // With a role filter the stored round_client role cells provide intersections.
        const input = selectedRole ? roleClients : selectedCells;
        const g = `client:${c.slug}`;
        const s = stats(selectedRole && !roles.some((r) => r.id === selectedRole) ? [] : input, g);
        grid.push({
          id: c.slug,
          label: c.name,
          ...s,
          questions: scored.map((q) => ({
            id: q.id,
            label: labelOf(q),
            ...stats(
              selectedRole && !roles.some((r) => r.id === selectedRole) ? [] : input,
              g,
              q.id,
            ),
          })),
        });
      }
    const questions = questionViews(scope, selectedCells, group, 'common');
    const keys = ['F12', 'F5', 'F14', 'F9', 'F8', 'F11', 'F16', 'F19'];
    const tasks = selectedCells
      .filter((c) => c.group === group && c.metric_key.startsWith('ki.heaviest_task.'))
      .map((c) => ({ id: c.metric_key.split('.').at(-1)!, cell: c }))
      .filter((t) => !t.cell.suppressed)
      .sort(
        (a, b) =>
          (b.cell.suppressed ? 0 : b.cell.numerator) - (a.cell.suppressed ? 0 : a.cell.numerator),
      );
    // A closed round shows the findings saved once for its release (2.5); role views use the
    // versions of that release. An open round is calculated live with the latest versions.
    const closed = ['closed', 'archived'].includes(scope.round.status);
    const id = scope.clients.find((c) => c.slug === scope.client)?.id;
    const saved = closed
      ? await this.findings.released(scope.round, id ? { id } : undefined, content, cells)
      : undefined;
    const findings =
      saved && !selectedRole
        ? saved.findings
        : await this.findings.calculate(
            scope.round,
            content,
            selectedCells,
            group,
            'aggregate',
            saved?.release,
          );
    const latest = new Map(
      (await this.findings.rules(prefix, 'aggregate')).map((r) => [r.key, r.version]),
    );
    // The thresholds these findings were computed with (editable per rule since 2.5): one value
    // when every counted rule of the view shares it, otherwise null.
    const used = closed
      ? await this.findings.rulesFor(scope.round, prefix, 'aggregate', saved?.release)
      : await this.findings.rules(prefix, 'aggregate');
    const counted = used.filter((r) => !r.computed);
    const same = (values: number[]) =>
      values.length > 0 && values.every((v) => v === values[0]) ? values[0]! : null;
    return {
      findings: findings.map((f) => ({ ...f, latest_version: latest.get(f.key) ?? f.version })),
      finding_thresholds: {
        min_count: same(counted.map((r) => r.min_count)),
        medium: same(counted.map((r) => r.threshold.medium)),
        high: same(counted.map((r) => r.threshold.high)),
      },
      class: 'aggregate' as const,
      round,
      template: prefix,
      mode: scope.round.identification,
      source: ['closed', 'archived'].includes(scope.round.status) ? 'released' : 'live',
      client: scope.client ?? null,
      role: selectedRole ?? null,
      roles,
      suppression_note:
        'Roller med færre enn 3 svar og grupper som kan røpe små grupper, er ikkje viste.',
      zones:
        prefix === 'tryggleik'
          ? {
              ...stats(selectedCells, group),
              questions: scored.map((q) => ({
                id: q.id,
                label: labelOf(q),
                ...stats(selectedCells, group, q.id),
              })),
              persons: ['gron', 'gul', 'oransje', 'raud'].map((id) => ({
                id,
                cell: cellAt(selectedCells, `${prefix}.persons_per_zone.${id}`, group) ?? null,
              })),
              grid,
            }
          : null,
      key_questions: keys.flatMap((id) => {
        const q = questions.find((q) => q.id === id);
        return q ? [{ ...q, ...stats(selectedCells, group, id) }] : [];
      }),
      questions,
      ki:
        prefix === 'ki'
          ? {
              routine_hours: cellAt(selectedCells, 'ki.routine_hours_week', group) ?? null,
              tasks: tasks.map((t) => ({
                ...t,
                label:
                  content.questions.find((q) => q.id === 'K16' && 'options' in q)?.type === 'single'
                    ? ((
                        content.questions.find((q) => q.id === 'K16') as Extract<
                          Question,
                          { type: 'single' }
                        >
                      ).options.find((o) => o.id === t.id)?.texts.text.nn ?? t.id)
                    : t.id,
                total: cellAt(selectedCells, `ki.k3.distribution.${t.id}`, group) ?? null,
              })),
            }
          : null,
    };
  }
}
export type AggregateModel = Awaited<ReturnType<AggregateView['load']>>;
