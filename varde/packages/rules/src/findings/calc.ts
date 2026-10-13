// Pure calculations of the dashboard metrics (1.10, ADR-020, ADR-026), as kartlegging
// private/dashboard.html computes them: stat/personStat/soneP/soneS (451–470), fordeling (514),
// K8 × K7 (353), TIMAR (363), tyngsteOppgaver (364–378). Rows are one person's part each.

export interface MetricRow {
  client: string;
  role: string;
  part: 'common' | 'leader';
  answers: Readonly<Record<string, unknown>>;
}

/** Score table: question → option → score 0..3 (option.score of the template version). */
export type Scoring = Readonly<Record<string, Readonly<Record<string, number>>>>;

/** `K12.sporje` reads row `sporje` of scale K12. */
export function answerOf(row: MetricRow, key: string): unknown {
  const [id = '', sub] = key.split('.');
  const v = row.answers[id];
  if (sub === undefined) return v;
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)[sub]
    : undefined;
}

/** Values of an answer as strings: single → [v], multi → v, number → [String(n)]. */
export function valuesOf(v: unknown): string[] {
  if (typeof v === 'string') return v === '' ? [] : [v];
  if (typeof v === 'number') return [String(v)];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return [];
}

export const isAnswered = (v: unknown): boolean => valuesOf(v).length > 0;

/** Answered count and count per bucket (multi: a person counts once per bucket). */
export function distribution(
  rows: readonly MetricRow[],
  key: string,
  mapping: Readonly<Record<string, string | number>>,
) {
  const counts = new Map<string, number>();
  let n = 0;
  for (const r of rows) {
    const vals = valuesOf(answerOf(r, key));
    if (vals.length === 0) continue;
    n += 1;
    const buckets = new Set(
      vals
        .map((x) => mapping[x])
        .filter((b) => b !== undefined)
        .map(String),
    );
    for (const b of buckets) counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  return { n, counts };
}

/** Scores of one person's answers on the scored questions (unscored and missing are skipped). */
export function scoresOf(row: MetricRow, scoring: Scoring, questions: readonly string[]): number[] {
  const out: number[] = [];
  for (const q of questions) {
    const v = answerOf(row, q);
    const s = typeof v === 'string' ? scoring[q]?.[v] : undefined;
    if (s !== undefined) out.push(s);
  }
  return out;
}

/** stat(): sum and count of scored answers, persons with at least one, critical (≥ 2). */
export function scoreStat(
  rows: readonly MetricRow[],
  scoring: Scoring,
  questions: readonly string[],
) {
  let sum = 0;
  let count = 0;
  let critical = 0;
  let persons = 0;
  for (const r of rows) {
    const s = scoresOf(r, scoring, questions);
    if (s.length > 0) persons += 1;
    for (const x of s) {
      sum += x;
      count += 1;
      if (x >= 2) critical += 1;
    }
  }
  return { sum, count, critical, persons, mean: count > 0 ? sum / count : null };
}

export const meanScore = (
  rows: readonly MetricRow[],
  scoring: Scoring,
  questions: readonly string[],
) => scoreStat(rows, scoring, questions).mean;

export function criticalShare(
  rows: readonly MetricRow[],
  scoring: Scoring,
  questions: readonly string[],
): number | null {
  const s = scoreStat(rows, scoring, questions);
  return s.count > 0 ? s.critical / s.count : null;
}

/** Level of an aggregate (question, role, client): value > bound (soneS). */
export function zone(value: number, bounds: readonly number[]): number {
  let i = 0;
  while (i < bounds.length && value > (bounds[i] ?? Infinity)) i += 1;
  return i;
}

/** Level of one person: value ≥ bound (soneP). */
export function personLevel(value: number, bounds: readonly number[]): number {
  let i = 0;
  while (i < bounds.length && value >= (bounds[i] ?? Infinity)) i += 1;
  return i;
}

/** personStat().snitt — only for the class `rows` (1.27b), never in snapshots. */
export function personScore(
  row: MetricRow,
  scoring: Scoring,
  questions: readonly string[],
): number | null {
  const s = scoresOf(row, scoring, questions);
  return s.length > 0 ? s.reduce((a, b) => a + b, 0) / s.length : null;
}

/** fordeling(): persons with a score per person level. */
export function personsPerZone(
  rows: readonly MetricRow[],
  scoring: Scoring,
  questions: readonly string[],
  bounds: readonly number[],
) {
  const levels = new Array<number>(bounds.length + 1).fill(0);
  let n = 0;
  for (const r of rows) {
    const p = personScore(r, scoring, questions);
    if (p === null) continue;
    n += 1;
    const l = personLevel(p, bounds);
    levels[l] = (levels[l] ?? 0) + 1;
  }
  return { n, levels };
}

/** Pairs of two questions (K7 × K8): count per `${a}.${b}` among those who answered both. */
export function cross(
  rows: readonly MetricRow[],
  [k1, k2]: readonly [string, string],
  m1: Readonly<Record<string, string | number>>,
  m2: Readonly<Record<string, string | number>>,
) {
  const counts = new Map<string, number>();
  let n = 0;
  for (const r of rows) {
    const a = valuesOf(answerOf(r, k1))[0];
    const b = valuesOf(answerOf(r, k2))[0];
    const ba = a === undefined ? undefined : m1[a];
    const bb = b === undefined ? undefined : m2[b];
    if (ba === undefined || bb === undefined) continue;
    n += 1;
    counts.set(`${String(ba)}.${String(bb)}`, (counts.get(`${String(ba)}.${String(bb)}`) ?? 0) + 1);
  }
  return { n, counts };
}

/** Routine hours a week (K4 via TIMAR): persons with a mapped answer and the sum of hours. */
export function routineHoursWeek(
  rows: readonly MetricRow[],
  key: string,
  hours: Readonly<Record<string, number>>,
) {
  let n = 0;
  let sum = 0;
  for (const r of rows) {
    const v = valuesOf(answerOf(r, key))[0];
    const h = v === undefined ? undefined : hours[v];
    if (h === undefined) continue;
    n += 1;
    sum += h;
  }
  return { n, sum };
}

/** Heaviest task (K16 by K17 times × K18 minutes / 60), per task: persons, hours, with time. */
export function heaviestTask(
  rows: readonly MetricRow[],
  [task, times, minutes]: readonly [string, string, string],
  perWeek: Readonly<Record<string, number>>,
  perTime: Readonly<Record<string, number>>,
) {
  const out = new Map<string, { persons: number; hours: number; withTime: number }>();
  for (const r of rows) {
    const t = valuesOf(answerOf(r, task))[0];
    if (t === undefined) continue;
    const cur = out.get(t) ?? { persons: 0, hours: 0, withTime: 0 };
    cur.persons += 1;
    const g = perWeek[valuesOf(answerOf(r, times))[0] ?? ''];
    const m = perTime[valuesOf(answerOf(r, minutes))[0] ?? ''];
    if (g !== undefined && m !== undefined) {
      cur.hours += (g * m) / 60;
      cur.withTime += 1;
    }
    out.set(t, cur);
  }
  return out;
}
