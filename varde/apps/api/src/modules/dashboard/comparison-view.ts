import { readConfigJson } from '../../config/config-dir.js';
import { ComparabilityNote } from '@varde/schema/metrics/metric-definition';
import { Injectable } from '@nestjs/common';
import { PrivacyService, type ViewCell } from '../privacy/privacy.service.js';
import { DashboardContext, type DashboardScope } from './dashboard-context.js';
import { cellAt, labelOf, valueOf } from './aggregate-view.js';

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
function stats(cells: readonly ViewCell[], suffix = 'all', group = 'all') {
  const mean = valueOf(cellAt(cells, `tryggleik.mean_score.${suffix}`, group));
  const critical = valueOf(cellAt(cells, `tryggleik.critical_share.${suffix}`, group));
  const c = cellAt(cells, `tryggleik.mean_score.${suffix}`, group);
  return {
    mean,
    critical,
    zone: valueOf(cellAt(cells, `tryggleik.zone.${suffix}`, group)),
    n: c && !c.suppressed ? c.n : null,
  };
}
@Injectable()
export class ComparisonView {
  constructor(
    private readonly context: DashboardContext,
    private readonly privacy: PrivacyService,
  ) {}
  async load(round: string, client?: string, role?: string) {
    const scope = await this.context.load(round, client);
    if (scope.content.key !== 'tryggleik' || scope.round.type === 'external_import') return null;
    const previous = await this.context.previous(scope);
    // Stage 1 comparison is specifically the Forms external_import, not a regular round.
    const baseline = await this.baseline(scope, previous);
    if (!baseline) return null;
    const defs = scope.defs.filter((d) => d.part === 'common'),
      oldDefs = baseline.defs.filter((d) => d.part === 'common');
    const current = await this.privacy.viewCells(
      round,
      scope.client ? 'round_client' : 'all_clients',
      defs,
      scope.client,
    );
    const selectedRole = role && role !== 'alle' ? role : undefined,
      group = selectedRole ? `role:${selectedRole}` : 'all';
    const allCurrent = scope.client
      ? await this.privacy.viewCells(round, 'all_clients', defs)
      : current;
    const participating = [
      ...new Set(
        allCurrent.filter((c) => c.group.startsWith('client:')).map((c) => c.group.slice(7)),
      ),
    ];
    const roleParticipants = selectedRole
      ? (
          await Promise.all(
            participating.map(async (c) => ({
              client: c,
              cells: await this.privacy.viewCells(round, 'round_client', defs, c),
            })),
          )
        )
          .filter((r) => r.cells.some((c) => c.group === group))
          .map((r) => r.client)
      : participating;
    const cohort = scope.client
      ? roleParticipants.filter((c) => c === scope.client)
      : roleParticipants;
    const historical = await this.privacy.cohortCells(
      baseline.round.id,
      cohort,
      oldDefs,
      selectedRole,
    );
    const oldAll = await this.privacy.viewCells(baseline.round.id, 'all_clients', oldDefs);
    const oldParticipants = [
      ...new Set(oldAll.filter((c) => c.group.startsWith('client:')).map((c) => c.group.slice(7))),
    ];
    const row = (
      id: string,
      label: string,
      before: ReturnType<typeof stats>,
      now: ReturnType<typeof stats>,
    ) => ({
      id,
      label,
      before,
      now,
      change: change(before.mean, now.mean),
      critical_change: change(before.critical, now.critical, true),
    });
    const qs = scope.content.questions.filter(
      (q) => 'options' in q && q.options.some((o) => o.score !== undefined),
    );
    const questions = qs.map((q) =>
      row(q.id, labelOf(q), stats(historical, q.id), stats(current, q.id, group)),
    );
    const clients = [];
    for (const slug of [...new Set([...oldParticipants, ...participating])].filter(
      (slug) => !scope.client || slug === scope.client,
    )) {
      const old = await this.privacy.viewCells(baseline.round.id, 'round_client', oldDefs, slug);
      const now = await this.privacy.viewCells(round, 'round_client', defs, slug);
      clients.push(
        row(
          slug,
          scope.clients.find((c) => c.slug === slug)?.name ??
            baseline.clients.find((c) => c.slug === slug)?.name ??
            slug,
          stats(old, 'all', group),
          stats(now, 'all', group),
        ),
      );
    }
    const comparability = scope.defs.find((d) => d.kind === 'mean_score')?.comparability ?? [];
    return {
      class: 'aggregate' as const,
      round,
      baseline: baseline.round.id,
      clients: clients.sort((a, b) => a.label.localeCompare(b.label)),
      questions,
      total: row('all', 'Samla', stats(historical), stats(current, 'all', group)),
      not_yet: oldParticipants
        .filter((c) => !cohort.includes(c))
        .map((slug) => baseline.clients.find((c) => c.slug === slug)?.name ?? slug),
      comparability,
      note: ComparabilityNote.parse(readConfigJson('comparability-f-anchors.json')).note,
    };
  }
  private async baseline(
    scope: DashboardScope,
    previous: DashboardScope | undefined,
  ): Promise<DashboardScope | undefined> {
    if (!previous) return undefined;
    if (previous.round.type === 'external_import') return previous;
    return this.baseline(scope, await this.context.previous(previous));
  }
}
export type ComparisonModel = NonNullable<Awaited<ReturnType<ComparisonView['load']>>>;
