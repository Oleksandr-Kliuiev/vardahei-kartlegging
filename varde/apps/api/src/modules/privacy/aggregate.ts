// Class `aggregate` (0.15, ADR-021): counts per group with threshold k, complementary
// suppression (a hidden group must not be recoverable by subtraction from the total), small
// clients only in the sum. Identical in both identification modes. The output is built from
// scratch: no respondent_key, answers or submission ids can reach it.
import { populationAllows } from '@varde/schema/metrics/populations';
import {
  type AggregateQuery,
  type AggregateResult,
  type Cell,
  PrivacyViolation,
  type ResponseRow,
} from './types.js';

export const TOTAL = 'all';

interface Stats {
  group: string;
  n: number;
  numerator: number;
  denominator: number;
}

/** Throws PrivacyViolation for part × population combinations the contract forbids. */
export function assertAggregateQuery(query: AggregateQuery): void {
  if (!populationAllows(query.population, query.part)) {
    throw new PrivacyViolation(`part ${query.part} is not allowed for ${query.population}`);
  }
  if (query.population === 'round_client' && query.client === undefined) {
    throw new PrivacyViolation('round_client needs a client');
  }
  if (query.population !== 'round_client' && query.client !== undefined) {
    throw new PrivacyViolation(`${query.population} is never split by one client`);
  }
}

function answered(value: unknown): boolean {
  return value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0);
}

function chose(value: unknown, option: string): boolean {
  return Array.isArray(value) ? value.includes(option) : value === option;
}

function stats(group: string, rows: readonly ResponseRow[], q: AggregateQuery): Stats {
  let numerator = 0;
  let denominator = 0;
  for (const row of rows) {
    const value = row.answers[q.question];
    if (!answered(value)) continue;
    denominator += 1;
    if (chose(value, q.option)) numerator += 1;
  }
  return { group, n: rows.length, numerator, denominator };
}

/**
 * Groups hidden for a total and its partition: every part with n < k, then — while the hidden
 * parts together are recoverable (0 < Σn < k) — the smallest visible part ("suppress the
 * smaller"). A total below k hides everything.
 */
export function suppressedGroups(total: Stats, parts: readonly Stats[], k: number): Set<string> {
  if (total.n < k) return new Set([total.group, ...parts.map((p) => p.group)]);
  const hidden = new Set(parts.filter((p) => p.n < k).map((p) => p.group));
  for (;;) {
    // Include respondents without an explicit group in this partition.
    const hiddenN =
      total.n - parts.filter((p) => !hidden.has(p.group)).reduce((s, p) => s + p.n, 0);
    if (hiddenN === 0 || hiddenN >= k) return hidden;
    const visible = parts.filter((p) => !hidden.has(p.group)).sort((a, b) => a.n - b.n);
    const smallest = visible[0];
    if (smallest === undefined) return new Set([total.group, ...hidden]);
    hidden.add(smallest.group);
  }
}

function partition(rows: readonly ResponseRow[], key: (r: ResponseRow) => string) {
  const groups = new Map<string, ResponseRow[]>();
  for (const row of rows) {
    const name = key(row);
    groups.set(name, [...(groups.get(name) ?? []), row]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

const today = (): string => new Date().toISOString().slice(0, 10);

/** Aggregate over the rows of the source; `rows` may contain more than the query needs. */
export function aggregate(
  query: AggregateQuery,
  rows: readonly ResponseRow[],
  k: number,
): AggregateResult {
  assertAggregateQuery(query);
  const own = rows.filter(
    (r) =>
      r.part === query.part && (query.population !== 'round_client' || r.client === query.client),
  );
  const total = stats(TOTAL, own, query);
  const parts =
    query.population === 'round_client'
      ? partition(own, (r) => `role:${r.role}`)
      : query.population === 'all_clients'
        ? partition(own, (r) => `client:${r.client}`)
        : []; // leaders_all: only "all clients of the round", no split by client or role
  const partStats = parts.map(([group, groupRows]) => stats(group, groupRows, query));
  const hidden = suppressedGroups(total, partStats, k);
  const cells: Cell[] = [total, ...partStats].map((s) =>
    hidden.has(s.group)
      ? { group: s.group, suppressed: true }
      : {
          group: s.group,
          suppressed: false,
          n: s.n,
          numerator: s.numerator,
          denominator: s.denominator,
          missing: s.n - s.denominator,
        },
  );
  return {
    round: query.round,
    population: query.population,
    ...(query.client === undefined ? {} : { client: query.client }),
    question: query.question,
    option: query.option,
    day: today(),
    cells,
  };
}
