// Cells of a group of clients of one round (ADR-021), only from cells privacy already lets out:
// a hidden part is never counted as zero, and nothing is recovered by subtracting from a total.
//  - cohortCells (1.29): the historical population of round 1 limited to the clients that answer
//    now — their released round_client cells summed, zones from the summed means.
//  - clientGroup (3.9): the clients of a seminar in one round — the round's all_clients view (live
//    with k and complementary suppression for an open round, released snapshots for a closed one):
//    the round's own total when the group is every client that answered, otherwise the sum of
//    their `client:<slug>` cells (complementary suppression already applied across the clients),
//    shown only while every one of them is visible. The round's total is hidden when it, minus
//    the own report of one hidden client, leaves the other hidden clients below k (BACKLOG «до
//    этапа 4» 16.10: «Før og etter» on the projector next to a client's report; decision of
//    Oleksandr 16.10: hide only then). Reached through PrivacyService.
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

/** The own report of one client (its released round_client cells); used only to decide
 * whether the round's total may be shown, never returned. */
type Own = (client: string) => Promise<ViewCell[]>;

/** The round's total per metric, hidden where `total − own report of a hidden client` is the sum
 * of the other hidden clients and below k. */
async function roundTotal(
  all: readonly ViewCell[],
  answered: readonly string[],
  own: Own,
  k: number,
): Promise<ViewCell[]> {
  const hidden = answered.filter((c) => all.some((x) => x.group === `client:${c}` && x.suppressed));
  const reports = await Promise.all(hidden.map(own));
  return all
    .filter((c) => c.group === 'all')
    .map((total): ViewCell => {
      if (total.suppressed) return total;
      const same = (x: ViewCell) =>
        x.metric_key === total.metric_key && x.metric_version === total.metric_version;
      const ownTotal = (x: ViewCell): x is Extract<ViewCell, { suppressed: false }> =>
        same(x) && x.group === 'all' && !x.suppressed;
      const hiddenHere = (c: string) =>
        all.some((x) => same(x) && x.group === `client:${c}` && x.suppressed);
      const rest =
        total.n -
        all.reduce(
          (s, x) => s + (same(x) && x.group.startsWith('client:') && !x.suppressed ? x.n : 0),
          0,
        );
      // Only a client hidden in this metric: a visible one subtracts nothing new.
      const leaks = reports.some(
        (cells, i) =>
          hiddenHere(hidden[i]!) && cells.some((x) => ownTotal(x) && x.n < rest && rest - x.n < k),
      );
      return leaks
        ? {
            metric_key: total.metric_key,
            metric_version: total.metric_version,
            group: 'all',
            suppressed: true,
          }
        : total;
    });
}

export async function clientGroup(
  read: Read,
  round: string,
  defs: readonly MetricDefinition[],
  clients: readonly string[],
  report: Own,
  k: number,
): Promise<ClientGroup> {
  const all = await read(
    round,
    'all_clients',
    defs.filter((d) => d.part === 'common'),
  );
  const everyone = clientsOf(all);
  const answered = everyone.filter((c) => clients.includes(c)).sort();
  const groups = new Set(answered.map((c) => `client:${c}`));
  const mine = all.filter((c) => groups.has(c.group));
  if (answered.length === 0) return { answered, cells: [] };
  if (answered.length === everyone.length)
    return { answered, cells: [...(await roundTotal(all, answered, report, k)), ...mine] };
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
        mine.find(
          (c) =>
            c.group === g && c.metric_key === m.metric_key && c.metric_version === m.metric_version,
        ),
      ),
      'all',
    ),
  );
  return { answered, cells: [...total, ...mine] };
}
