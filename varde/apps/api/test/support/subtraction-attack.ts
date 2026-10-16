// Subtraction attack on what privacy lets out (BACKLOG «до этапа 4», приёмка 1c I1; 3c, решение 2).
// The attacker holds some outputs of one round and one metric and solves the linear system they
// form. Unknowns are the (client, role) groups of the round; every visible cell is a known sum of
// them. A leak is a set S of groups with 0 < n(S) < k whose indicator lies in the row space of the
// visible cells (rank test, as in the temporary attack test of the 3c acceptance). Every group
// here has n ≥ 1 (everyone answers), so with k = 3 only single groups and pairs can leak.
import type { MetricDefinition } from '@varde/schema/metrics/metric-definition';
import type { ResponseRow, ViewCell } from '../../src/modules/privacy/privacy.service.js';

export const K = 3;
/** The counted sub-metric: `synthetic.nei` has the same n, so the same pattern of hidden cells. */
export const METRIC = 'synthetic.ja';

export const SYNTHETIC_DEF = {
  key: 'synthetic',
  version: 1,
  kind: 'distribution',
  part: 'common',
  questions: [{ key: 'F12', part: 'common' }],
  options_mapping: { F12: { ja: 'ja', nei: 'nei' } },
  scale: 'ja/nei',
  recall_period: 'no',
  denominator_rule: 'answered',
  populations: ['round_client', 'all_clients'],
  comparability: [],
  first_version: true,
} as const satisfies MetricDefinition;

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

export interface Group {
  client: string;
  /** '' = no role: such answers are never a group of their own, only part of the totals. */
  role: string;
  n: number;
  yes: number;
}

/** A random round: 2–7 clients of 1–8 answers, 1–3 roles, now and then an answer without role. */
export function randomRows(rand: () => number, round: string): ResponseRow[] {
  const clients = 2 + Math.floor(rand() * 6);
  const roles = 1 + Math.floor(rand() * 3);
  const rows: ResponseRow[] = [];
  for (let c = 0; c < clients; c += 1) {
    const size = 1 + Math.floor(rand() * 8);
    for (let i = 0; i < size; i += 1)
      rows.push(row(round, `k${c}`, rand() < 0.08 ? '' : `r${Math.floor(rand() * roles)}`, rand()));
  }
  return rows;
}

/** One answer of `client` in `role`; `yes` below 0.5 answers «ja». */
export function row(round: string, client: string, role: string, yes: number): ResponseRow {
  return {
    round_client: `${round}:${client}`,
    client,
    part: 'common',
    role,
    answers: { F12: yes < 0.5 ? 'ja' : 'nei' },
    submitted_day: '2026-10-16',
  };
}

export function groupsOf(rows: readonly ResponseRow[]): Group[] {
  const out = new Map<string, Group>();
  for (const r of rows) {
    const key = `${r.client}|${r.role}`;
    const g = out.get(key) ?? { client: r.client, role: r.role, n: 0, yes: 0 };
    g.n += 1;
    if (r.answers.F12 === 'ja') g.yes += 1;
    out.set(key, g);
  }
  return [...out.values()].sort((a, b) =>
    `${a.client}|${a.role}`.localeCompare(`${b.client}|${b.role}`),
  );
}

/** Which groups one output cell sums, by the output it came from. */
export type Cover = (cell: string) => (g: Group) => boolean;
export const roundClientCover =
  (client: string): Cover =>
  (cell) =>
    cell === 'all'
      ? (g) => g.client === client
      : (g) => g.client === client && `role:${g.role}` === cell;
export const allClientsCover: Cover = (cell) =>
  cell === 'all'
    ? () => true
    : cell.startsWith('client:')
      ? (g) => `client:${g.client}` === cell
      : (g) => `role:${g.role}` === cell;
/** clientGroup(round, defs, clients): `all` is the sum over the clients asked for. */
export const clientGroupCover =
  (clients: readonly string[]): Cover =>
  (cell) =>
    cell === 'all' ? (g) => clients.includes(g.client) : (g) => `client:${g.client}` === cell;

export interface Equation {
  /** The group of the output cell (`all`, `client:<slug>`, `role:<id>`). */
  group: string;
  vector: number[];
  /** What the output says, checked against the truth (a wrong number is a finding too). */
  n: number;
  yes: number;
  truth: { n: number; yes: number };
}

/** Visible cells of the counted metric as equations over `groups`. */
export function equations(
  groups: readonly Group[],
  cells: readonly ViewCell[],
  cover: Cover,
): Equation[] {
  return cells.flatMap((c) => {
    if (c.suppressed || c.metric_key !== METRIC) return [];
    const inside = cover(c.group);
    const vector = groups.map((g) => (inside(g) ? 1 : 0));
    const truth = groups.reduce(
      (s, g, i) => ({ n: s.n + vector[i]! * g.n, yes: s.yes + vector[i]! * g.yes }),
      { n: 0, yes: 0 },
    );
    return [{ group: c.group, vector, n: c.n, yes: c.numerator, truth }];
  });
}

export function rank(rows: readonly (readonly number[])[]): number {
  const m = rows.map((r) => [...r]);
  const cols = m[0]?.length ?? 0;
  let rk = 0;
  for (let c = 0; c < cols && rk < m.length; c += 1) {
    let p = rk;
    for (let r = rk + 1; r < m.length; r += 1) if (Math.abs(m[r]![c]!) > Math.abs(m[p]![c]!)) p = r;
    if (Math.abs(m[p]![c]!) < 1e-9) continue;
    [m[rk], m[p]] = [m[p]!, m[rk]!];
    for (let r = 0; r < m.length; r += 1) {
      if (r === rk) continue;
      const f = m[r]![c]! / m[rk]![c]!;
      if (f !== 0) for (let j = c; j < cols; j += 1) m[r]![j]! -= f * m[rk]![j]!;
    }
    rk += 1;
  }
  return rk;
}

/** Sets of groups with 0 < n < k that the equations determine (singles and pairs, see above). */
export function leaks(groups: readonly Group[], eqs: readonly Equation[], k = K): Group[][] {
  const rows = eqs.map((e) => e.vector);
  const base = rank(rows);
  const determined = (set: readonly number[]) =>
    rank([...rows, groups.map((_, i) => (set.includes(i) ? 1 : 0))]) === base;
  const out: Group[][] = [];
  for (let i = 0; i < groups.length; i += 1) {
    if (groups[i]!.n < k && determined([i])) out.push([groups[i]!]);
    for (let j = i + 1; j < groups.length; j += 1)
      if (groups[i]!.n + groups[j]!.n < k && determined([i, j])) out.push([groups[i]!, groups[j]!]);
  }
  return out;
}

/** Equations whose number is not the true sum of the groups they cover. */
export const wrong = (eqs: readonly Equation[]) =>
  eqs.filter((e) => e.n !== e.truth.n || e.yes !== e.truth.yes);
