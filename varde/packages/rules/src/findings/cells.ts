// Cells of one MetricDefinition over response rows (1.10): groups `all`, `role:<id>` and, for
// `all_clients`, `client:<slug>`; for `leaders_all` only `all` (ADR-020). A definition with
// buckets yields one sub-metric per bucket (`<key>.<bucket>`); n = persons in the denominator.
import type { MetricDefinition } from '@varde/schema/metrics/metric-definition';
import type { Population } from '@varde/schema/metrics/populations';
import {
  cross,
  distribution,
  heaviestTask,
  type MetricRow,
  personsPerZone,
  routineHoursWeek,
  type Scoring,
  scoreStat,
  zone,
} from './calc.js';

export interface MetricCell {
  client?: string;
  metric_key: string;
  metric_version: number;
  group: string;
  n: number;
  numerator: number;
  denominator: number;
  missing: number;
}

type Values = Omit<MetricCell, 'client' | 'metric_version' | 'group'>;

export function groupsOf(
  rows: readonly MetricRow[],
  population: Population,
): [string, MetricRow[]][] {
  const out: [string, MetricRow[]][] = [['all', [...rows]]];
  if (population === 'leaders_all') return out;
  const by = (f: (r: MetricRow) => string, prefix: string) => {
    const m = new Map<string, MetricRow[]>();
    for (const r of rows) if (f(r) !== '') m.set(f(r), [...(m.get(f(r)) ?? []), r]);
    for (const k of [...m.keys()].sort()) out.push([`${prefix}:${k}`, m.get(k) ?? []]);
  };
  by((r) => r.role, 'role');
  if (population === 'all_clients') by((r) => r.client, 'client');
  return out;
}

const keys = (def: MetricDefinition) => def.questions.map((q) => q.key);
const mappingOf = (def: MetricDefinition, q: string) => def.options_mapping[q] ?? {};
const buckets = (m: Readonly<Record<string, string | number>>) => [
  ...new Set(Object.values(m).map(String)),
];

function scoring(def: MetricDefinition): Scoring {
  const out: Record<string, Record<string, number>> = {};
  for (const q of keys(def)) {
    out[q] = Object.fromEntries(Object.entries(mappingOf(def, q)).map(([o, s]) => [o, Number(s)]));
  }
  return out;
}

/** Values of one group for each sub-metric of the definition. */
export function metricValues(def: MetricDefinition, rows: readonly MetricRow[]): Values[] {
  const total = rows.length;
  const sub = (s: string) => `${def.key}.${s}`;
  switch (def.kind) {
    case 'distribution': {
      const q = keys(def)[0] ?? '';
      const m = mappingOf(def, q);
      const d = distribution(rows, q, m);
      return buckets(m).map((b) => ({
        metric_key: sub(b),
        n: d.n,
        numerator: d.counts.get(b) ?? 0,
        denominator: d.n,
        missing: total - d.n,
      }));
    }
    case 'mean_score':
    case 'critical_share':
    case 'zone': {
      const sc = scoring(def);
      const subsets: [string, string[]][] = [
        ['all', keys(def)],
        ...keys(def).map((q): [string, string[]] => [q, [q]]),
      ];
      return subsets.map(([name, qs]) => {
        const s = scoreStat(rows, sc, qs);
        const numerator =
          def.kind === 'mean_score'
            ? s.sum
            : def.kind === 'critical_share'
              ? s.critical
              : s.mean === null
                ? 0
                : zone(s.mean, def.thresholds?.aggregate.bounds ?? []);
        const denominator = def.kind === 'zone' ? 1 : s.count;
        return {
          metric_key: sub(name),
          n: s.persons,
          numerator,
          denominator,
          missing: total - s.persons,
        };
      });
    }
    case 'persons_per_zone': {
      const t = def.thresholds;
      const p = personsPerZone(rows, scoring(def), keys(def), t?.person.bounds ?? []);
      return (t?.levels ?? []).map((level, i) => ({
        metric_key: sub(level),
        n: p.n,
        numerator: p.levels[i] ?? 0,
        denominator: p.n,
        missing: total - p.n,
      }));
    }
    case 'cross': {
      const [k1 = '', k2 = ''] = keys(def);
      const m1 = mappingOf(def, k1);
      const m2 = mappingOf(def, k2);
      const c = cross(rows, [k1, k2], m1, m2);
      return buckets(m1).flatMap((a) =>
        buckets(m2).map((b) => ({
          metric_key: sub(`${a}.${b}`),
          n: c.n,
          numerator: c.counts.get(`${a}.${b}`) ?? 0,
          denominator: c.n,
          missing: total - c.n,
        })),
      );
    }
    case 'routine_hours_week': {
      const q = keys(def)[0] ?? '';
      const hours = Object.fromEntries(
        Object.entries(mappingOf(def, q)).map(([o, h]) => [o, Number(h)]),
      );
      const r = routineHoursWeek(rows, q, hours);
      return [
        { metric_key: def.key, n: r.n, numerator: r.sum, denominator: r.n, missing: total - r.n },
      ];
    }
    case 'heaviest_task': {
      const [task = '', times = '', minutes = ''] = keys(def);
      const num = (q: string) =>
        Object.fromEntries(Object.entries(mappingOf(def, q)).map(([o, x]) => [o, Number(x)]));
      const h = heaviestTask(rows, [task, times, minutes], num(times), num(minutes));
      return buckets(mappingOf(def, task)).map((t) => {
        const x = h.get(t) ?? { persons: 0, hours: 0, withTime: 0 };
        return {
          metric_key: sub(t),
          n: x.persons,
          numerator: x.hours,
          denominator: x.withTime,
          missing: total - x.persons,
        };
      });
    }
  }
}

/** All cells of a definition for one population (and, for round_client, one client). */
export function cells(
  def: MetricDefinition,
  rows: readonly MetricRow[],
  population: Population,
  client?: string,
): MetricCell[] {
  if (!def.populations.includes(population)) return [];
  const own = rows.filter((r) => r.part === def.part);
  return groupsOf(own, population).flatMap(([group, g]) =>
    metricValues(def, g).map((v) => ({
      ...(population === 'round_client' && client !== undefined ? { client } : {}),
      ...v,
      metric_version: def.version,
      group,
    })),
  );
}

/** Metric keys (`key@version`) a definition produces, independent of the rows. */
export function subMetrics(def: MetricDefinition): string[] {
  return metricValues(def, []).map((v) => `${v.metric_key}@${def.version}`);
}
