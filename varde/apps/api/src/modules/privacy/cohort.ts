// Cells of a group of clients of one round (ADR-021), only from cells privacy already lets out:
// a hidden part is never counted as zero, and nothing is recovered by subtracting from a total.
//  - cohortCells (1.29): the historical population of round 1 limited to the clients that answer
//    now — their released round_client cells summed, zones from the summed means.
//  - clientGroup (3.9): the clients of a seminar in one round — the round's all_clients view (live
//    with k and complementary suppression for an open round, released snapshots for a closed one):
//    the round's own total when the group is every client that answered, otherwise the sum of
//    their `client:<slug>` cells (complementary suppression already applied across the clients),
//    shown only while every one of them is visible. Reached through PrivacyService.
import { NotFoundException } from '@nestjs/common';
import { zone } from '@varde/rules/findings';
import type { MetricDefinition } from '@varde/schema/metrics/metric-definition';
import type { Population } from '@varde/schema/metrics/populations';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { ViewCell } from './view-cells.js';

type Read = (
  round: string,
  population: Population,
  defs: readonly MetricDefinition[],
  client?: string,
) => Promise<ViewCell[]>;

const clientsOf = (cells: readonly ViewCell[]) => [
  ...new Set(cells.filter((c) => c.group.startsWith('client:')).map((c) => c.group.slice(7))),
];

/** One cell `to` per metric of `inputs`: the sum of the parts, hidden when one is hidden or absent. */
function summed(key: string, inputs: readonly (ViewCell | undefined)[], to: string): ViewCell {
  const base = {
    metric_key: key,
    metric_version: inputs.find((c) => c)?.metric_version ?? 1,
    group: to,
  };
  if (inputs.some((c) => !c || c.suppressed)) return { ...base, suppressed: true };
  const sum = (field: 'n' | 'numerator' | 'denominator' | 'missing') =>
    inputs.reduce((s, c) => s + (c && !c.suppressed ? c[field] : 0), 0);
  return {
    ...base,
    suppressed: false,
    n: sum('n'),
    numerator: sum('numerator'),
    denominator: sum('denominator'),
    missing: sum('missing'),
  };
}

export async function cohortCells(
  prisma: PrismaService,
  read: Read,
  round: string,
  clients: readonly string[],
  defs: readonly MetricDefinition[],
  role?: string,
): Promise<ViewCell[]> {
  const r = await prisma.round.findUnique({ where: { id: round } });
  if (!r || !['closed', 'archived'].includes(r.status))
    throw new NotFoundException('Førre runde er ikkje publisert.');
  const common = defs.filter((d) => d.part === 'common');
  const all = await read(round, 'all_clients', common);
  const participants = clientsOf(all);
  const selected = participants.filter((c) => clients.includes(c));
  const group = role ? `role:${role}` : 'all';
  if (!selected.length) return [];
  if (selected.length === participants.length)
    return all.filter((c) => c.group === group).map((c) => ({ ...c, group: 'all' }));
  const parts = await Promise.all(selected.map((c) => read(round, 'round_client', common, c)));
  const keys = [...new Set(all.map((c) => c.metric_key))];
  const values: ViewCell[] = keys
    .filter((key) => !key.includes('.zone.'))
    .map((key) =>
      summed(
        key,
        parts.map((p) => p.find((c) => c.group === group && c.metric_key === key)),
        'all',
      ),
    );
  const zoneDef = defs.find((d) => d.kind === 'zone');
  if (zoneDef)
    for (const mean of values.filter((c) =>
      c.metric_key.startsWith(`${zoneDef.key.replace(/zone$/, 'mean_score')}.`),
    )) {
      const base = {
        metric_key: mean.metric_key.replace('.mean_score.', '.zone.'),
        metric_version: zoneDef.version,
        group: 'all',
      };
      values.push(
        mean.suppressed || !mean.denominator
          ? { ...base, suppressed: true }
          : {
              ...base,
              suppressed: false,
              n: mean.n,
              numerator: zone(
                mean.numerator / mean.denominator,
                zoneDef.thresholds!.aggregate.bounds,
              ),
              denominator: 1,
              missing: mean.missing,
            },
      );
    }
  return values;
}

export interface ClientGroup {
  /** Clients of the group that answered in the round (have cells, visible or hidden). */
  answered: string[];
  /** Group `all` for the whole group, and `client:<slug>` of each client that answered. */
  cells: ViewCell[];
}

export async function clientGroup(
  read: Read,
  round: string,
  defs: readonly MetricDefinition[],
  clients: readonly string[],
): Promise<ClientGroup> {
  const all = await read(
    round,
    'all_clients',
    defs.filter((d) => d.part === 'common'),
  );
  const everyone = clientsOf(all);
  const answered = everyone.filter((c) => clients.includes(c)).sort();
  const groups = new Set(answered.map((c) => `client:${c}`));
  const own = all.filter((c) => groups.has(c.group));
  if (answered.length === 0) return { answered, cells: [] };
  if (answered.length === everyone.length)
    return { answered, cells: [...all.filter((c) => c.group === 'all'), ...own] };
  // A zone is a level, not a count: it is never summed (the group shows no zone).
  const metrics = [
    ...new Map(
      all
        .filter((c) => !c.metric_key.includes('.zone.'))
        .map((c) => [`${c.metric_key}@${c.metric_version}`, c]),
    ).values(),
  ];
  const total = metrics.map((m) =>
    summed(
      m.metric_key,
      [...groups].map((g) =>
        own.find(
          (c) =>
            c.group === g && c.metric_key === m.metric_key && c.metric_version === m.metric_version,
        ),
      ),
      'all',
    ),
  );
  return { answered, cells: [...total, ...own] };
}
