// privacy.release() (0.15b, ADR-021 "Подавление с учётом истории выдач"): the only way to a
// released snapshot. Unit: (round, population, metric_version, group) with (n, numerator).
//  (1) n ≥ k, plus complementary suppression inside the new release;
//  (2) against EVERY earlier release of the same (round, population), superseded ones included
//      (1.4c): Δn = 0 or |Δn| ≥ k, otherwise the current released value is carried forward
//      with `stale`;
//  (3) complementary suppression on the differences (Δtotal − Δrole A < k → carry-forward of
//      the total or role A as well), against every earlier release too;
//  (4) the metric set is fixed on the ROUND by its first release of any population (1.4c):
//      a metric outside the set → ReleaseRejected for every population;
//  (5) manual and automatic release are this function with an actor and an AuditLog entry;
//  (6) progress cells follow the same rules; exact counts (`responses_total`) are the named
//      exception and are released as they are.
// computed → released happens only in `markReleased`, which is not exported.
import { randomUUID } from 'node:crypto';
import {
  type ComputedSnapshot,
  type ReleasedSnapshot,
  type SupersededSnapshot,
  transition,
} from '@varde/schema/metrics/aggregate-snapshot';
import type { Population } from '@varde/schema/metrics/populations';
import { suppressedGroups, TOTAL } from './aggregate.js';
import { PrivacyViolation } from './types.js';

/** One computed cell offered for release. */
export interface ComputedCell {
  client?: string;
  metric_key: string;
  metric_version: number;
  group: string;
  n: number;
  numerator: number;
  denominator: number;
  missing: number;
}

export type ReleaseActor = { type: 'manual'; who: string } | { type: 'auto'; who: 'system' };

/** One cell of an earlier release (released or later superseded). */
export interface HistoricCell {
  client?: string | undefined;
  metric_key: string;
  metric_version: number;
  group: string;
  n: number;
  suppressed: boolean;
}

export interface SnapshotStore {
  /** Current released snapshots (not superseded) of one (round, population). */
  listReleased(round: string, population: Population): Promise<ReleasedSnapshot[]>;
  /** Every earlier release of one (round, population), superseded ones included (1.4c). */
  listHistory(round: string, population: Population): Promise<readonly (readonly HistoricCell[])[]>;
  /** Metric set (`key@version`) fixed on the round, or null before its first release. */
  metricSet(round: string): Promise<readonly string[] | null>;
  fixMetricSet(round: string, metrics: readonly string[]): Promise<void>;
  save(snapshots: readonly ReleasedSnapshot[], releaseId: string): Promise<void>;
  supersede(snapshots: readonly SupersededSnapshot[]): Promise<void>;
}

export interface ReleaseOptions {
  /** Full metric set of the round, fixed by its first release (default: the offered cells). */
  metric_set?: readonly string[];
}

export interface ReleaseAudit {
  write(entry: {
    who: string;
    what: string;
    target: string;
    details: Record<string, string | number | boolean>;
  }): Promise<void>;
}

export interface ReleaseConfig {
  k: number;
  /** Metric keys released exactly, without suppression (ADR-021 rule 6). */
  exact_counts: readonly string[];
}

export interface ReleaseResult {
  released: ReleasedSnapshot[];
  superseded: number;
  carried: number;
}

export class ReleaseRejected extends PrivacyViolation {
  override readonly name: string = 'ReleaseRejected';
}

export const metricOf = (c: { metric_key: string; metric_version: number }): string =>
  `${c.metric_key}@${c.metric_version}`;
const blockOf = (c: { client?: string | undefined } & Parameters<typeof metricOf>[0]) =>
  `${c.client ?? ''}|${metricOf(c)}`;
const unitOf = (c: Parameters<typeof blockOf>[0] & { group: string }) => `${blockOf(c)}|${c.group}`;

/** The only computed → released transition; module-private on purpose (0.16, 0.15b). */
function markReleased(snapshot: ComputedSnapshot, releasedAt: string): ReleasedSnapshot {
  return Object.freeze({
    ...snapshot,
    status: 'released',
    released_at: releasedAt,
  }) as ReleasedSnapshot;
}

function assertActor(actor: unknown): ReleaseActor {
  const a = actor as Partial<ReleaseActor> | null | undefined;
  const ok =
    (a?.type === 'manual' && typeof a.who === 'string' && a.who !== '') ||
    (a?.type === 'auto' && a.who === 'system');
  if (!ok) throw new ReleaseRejected('release needs an actor (manual with who, or auto)');
  return a;
}

/** Groups to carry forward because of differences 0 < |Δn| < k (rules 2 and 3). */
function carriedByDiff(deltas: Map<string, number>, k: number): Set<string> {
  const small = (d: number) => d !== 0 && Math.abs(d) < k;
  const total = deltas.get(TOTAL) ?? 0;
  const parts = [...deltas.entries()].filter(([g]) => g !== TOTAL);
  if (small(total)) return new Set(deltas.keys());
  const hidden = new Set(parts.filter(([, d]) => small(d)).map(([g]) => g));
  for (;;) {
    const sum = parts.filter(([g]) => hidden.has(g)).reduce((s, [, d]) => s + Math.abs(d), 0);
    if (sum === 0 || sum >= k) return hidden;
    const next = parts
      .filter(([g, d]) => !hidden.has(g) && d !== 0)
      .sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))[0];
    if (next === undefined) return new Set(deltas.keys());
    hidden.add(next[0]);
  }
}

const day = (): string => new Date().toISOString().slice(0, 10);

/** Rule 4 (1.4c): the set is per round; returns the set to fix now, or null if already fixed. */
async function checkMetricSet(
  round: string,
  cells: readonly ComputedCell[],
  store: SnapshotStore,
  opts: ReleaseOptions,
): Promise<string[] | null> {
  const fixed = await store.metricSet(round);
  const set = fixed ?? opts.metric_set ?? [...new Set(cells.map(metricOf))];
  const outside = [...new Set(cells.map(metricOf))].filter((m) => !set.includes(m));
  if (outside.length > 0) {
    throw new ReleaseRejected(`metric set of the round is fixed: ${outside.join(', ')}`);
  }
  return fixed === null ? [...set] : null;
}

/** Shape of cells by population (1.10b, ADR-020): leaders_all only `all` without a client;
 * round_client needs a client; all_clients has none (groups `client:<slug>` instead). */
function assertShape(population: Population, cells: readonly ComputedCell[]): void {
  for (const c of cells) {
    const bad =
      population === 'leaders_all'
        ? c.client !== undefined || c.group !== TOTAL
        : population === 'round_client'
          ? c.client === undefined
          : c.client !== undefined;
    if (bad)
      throw new ReleaseRejected(
        `cell ${c.metric_key}/${c.group} does not fit population ${population}`,
      );
  }
}

export async function release(
  round: string,
  population: Population,
  cells: readonly ComputedCell[],
  store: SnapshotStore,
  actor: ReleaseActor,
  deps: { audit: ReleaseAudit; config: ReleaseConfig },
  opts: ReleaseOptions = {},
): Promise<ReleaseResult> {
  const who = assertActor(actor);
  assertShape(population, cells);
  const { k, exact_counts } = deps.config;
  const toFix = await checkMetricSet(round, cells, store, opts);
  const previous = await store.listReleased(round, population);
  const prevByUnit = new Map(previous.map((s) => [unitOf(s), s]));
  const history = (await store.listHistory(round, population)).map(
    (h) => new Map(h.map((c) => [unitOf(c), c.suppressed ? 0 : c.n])),
  );

  const blocks = new Map<string, ComputedCell[]>();
  for (const c of cells) blocks.set(blockOf(c), [...(blocks.get(blockOf(c)) ?? []), c]);

  const now = day();
  const out: ReleasedSnapshot[] = [];
  let carried = 0;
  for (const block of blocks.values()) {
    // The exact counter is the named exception only as round_client × group `all` (1.10b);
    // its other groups and other populations follow the general rules.
    const exact =
      population === 'round_client' && exact_counts.includes(block[0]?.metric_key ?? '');
    const byGroup = new Map(block.map((c) => [c.group, c]));
    const total = byGroup.get(TOTAL);
    const parts = block.filter((c) => c.group !== TOTAL);
    // Rule 1 and complementary suppression inside the new release; a block without a total
    // (e.g. drop-out per question) has no subtraction relation between its groups.
    const suppressed =
      total === undefined
        ? new Set(parts.filter((c) => c.n < k).map((c) => c.group))
        : suppressedGroups(total, parts, k);
    // Rules 2 and 3 against every earlier release (|Δn|: after a deletion n goes down).
    const carry = new Set<string>();
    for (const earlier of history) {
      const deltas = new Map(block.map((c) => [c.group, c.n - (earlier.get(unitOf(c)) ?? 0)]));
      const hit =
        total === undefined
          ? [...deltas].filter(([, d]) => d !== 0 && Math.abs(d) < k).map(([g]) => g)
          : carriedByDiff(deltas, k);
      for (const g of hit) carry.add(g);
    }
    if (exact) {
      suppressed.delete(TOTAL);
      carry.delete(TOTAL);
    }

    for (const c of block) {
      const base = {
        round,
        population,
        ...(c.client === undefined ? {} : { client: c.client }),
        metric_key: c.metric_key,
        metric_version: c.metric_version,
        group: c.group,
        computed_at: now,
        status: 'computed' as const,
      };
      const prev = prevByUnit.get(unitOf(c));
      let snapshot: ComputedSnapshot;
      if (suppressed.has(c.group)) {
        snapshot = { ...base, n: 0, numerator: 0, denominator: 0, missing: 0, suppressed: true };
      } else if (carry.has(c.group) && prev !== undefined) {
        carried += 1;
        const { n, numerator, denominator, missing, suppressed: s } = prev;
        snapshot = { ...base, n, numerator, denominator, missing, suppressed: s, stale: true };
      } else if (carry.has(c.group)) {
        snapshot = { ...base, n: 0, numerator: 0, denominator: 0, missing: 0, suppressed: true };
      } else {
        const { n, numerator, denominator, missing } = c;
        snapshot = { ...base, n, numerator, denominator, missing, suppressed: false };
      }
      out.push(markReleased(snapshot, now));
    }
  }

  // Released cells not offered again keep their value (what was released cannot be withdrawn).
  const offered = new Set(cells.map(unitOf));
  for (const prev of previous) {
    if (offered.has(unitOf(prev))) continue;
    carried += 1;
    const { n, numerator, denominator, missing, suppressed, computed_at } = prev;
    const where = prev.client === undefined ? {} : { client: prev.client };
    const unit = { metric_key: prev.metric_key, metric_version: prev.metric_version };
    const values = { n, numerator, denominator, missing, suppressed, computed_at, stale: true };
    const snapshot: ComputedSnapshot = {
      round,
      population,
      ...where,
      ...unit,
      group: prev.group,
      ...values,
      status: 'computed',
    };
    out.push(markReleased(snapshot, now));
  }

  const superseded = previous.map((s) => transition(s, 'superseded', { reason: 'new release' }));
  if (toFix !== null) await store.fixMetricSet(round, toFix);
  await store.supersede(superseded);
  await store.save(out, randomUUID());
  await deps.audit.write({
    who: who.type === 'manual' ? who.who : 'system',
    what: who.type === 'manual' ? 'privacy.release.manual' : 'privacy.release.auto',
    target: `round:${round}`,
    details: { round, population, cells: out.length, carried, superseded: superseded.length },
  });
  return { released: out, superseded: superseded.length, carried };
}
