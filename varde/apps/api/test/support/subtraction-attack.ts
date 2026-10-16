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

/** One equation of a release: the cells (client, role) it sums and the release its value comes
 * from (a carried value is the one of an earlier release). */
export interface Shown {
  vector: number[];
  origin: number;
}

/**
 * Leaks across releases for an attacker who knows the client × role structure but not who
 * answered when (the model of release rule 7). Unknowns: the table x_e of every release e over
 * the cells of the final structure. A set S of cells is determined in release e when 1_S lies
 * in the span of the equations with origin e; protected are x_e(S) and, for S determined in two
 * releases, x_e'(S) − x_e(S), when 0 < |n| < k. Candidates: every 2-level cut of the full
 * client × role graph (role '' included), enumerated over all node subsets — independent of the
 * merged graph of privacy/cross.ts. Answers only arrive, so a set below k has a cut below k.
 */
export function historyLeaks(
  cells: readonly { client: string; role: string }[],
  shown: readonly Shown[],
  value: (cell: number, epoch: number) => number,
  epochs: number,
  k = K,
): string[] {
  const clients = [...new Set(cells.map((c) => c.client))];
  const roles = [...new Set(cells.map((c) => c.role))];
  const nodes = [...clients.map((c) => `c:${c}`), ...roles.map((r) => `r:${r}`)];
  const cuts = new Map<string, number[]>();
  for (let mask = 1; mask < 2 ** nodes.length; mask += 1) {
    const inX = (n: string) => (mask & (1 << nodes.indexOf(n))) !== 0;
    // Closure: a role in X has all its clients in X.
    if (cells.some((c) => inX(`r:${c.role}`) && !inX(`c:${c.client}`))) continue;
    const s = cells.map((c) => (inX(`c:${c.client}`) && !inX(`r:${c.role}`) ? 1 : 0));
    if (s.some((v) => v === 1)) cuts.set(s.join(''), s);
  }
  const span = (e: number) => shown.filter((x) => x.origin === e).map((x) => x.vector);
  const out: string[] = [];
  const n = (s: number[], e: number) => s.reduce((t, v, i) => t + v * value(i, e), 0);
  const label = (s: number[]) =>
    cells.flatMap((c, i) => (s[i] ? [`${c.client}/${c.role || '–'}`] : [])).join('+');
  for (const s of cuts.values()) {
    const at = Array.from({ length: epochs }, (_, i) => {
      const rows = span(i + 1);
      return rows.length > 0 && rank([...rows, s]) === rank(rows);
    });
    for (let e = 1; e <= epochs; e += 1) {
      if (!at[e - 1]) continue;
      const here = n(s, e);
      if (here > 0 && here < k) out.push(`${label(s)} @${e} n=${here}`);
      for (let f = e + 1; f <= epochs; f += 1) {
        const d = n(s, f) - here;
        if (at[f - 1] && d !== 0 && Math.abs(d) < k) out.push(`${label(s)} @${e}→${f} Δ=${d}`);
      }
    }
  }
  return out;
}
