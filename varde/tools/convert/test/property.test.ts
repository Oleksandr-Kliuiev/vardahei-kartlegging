// Task 1.2, property: on 2000 answer sets generated along the old runner path (fixed seed),
// every source function `vis`/`naar` and evaluate() of 1.6 on the converted expression agree.
import { evaluate } from '@varde/rules/runner';
import type { Expression } from '@varde/schema/template/expression';
import { describe, expect, it } from 'vitest';
import { convertSkjema } from '../src/convert.js';
import type { Kartlegging, Sporsmal } from '../src/kartlegging.js';
import { current, old } from './support.js';

type Svar = Record<string, unknown>;

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One respondent along kartlegging index.html (synleg, valAv, aleine, maks, leader part). */
function generate(
  k: Kartlegging,
  skjema: Sporsmal[],
  r: () => number,
  onShow: (q: Sporsmal, s: Svar) => void,
): Svar {
  const s: Svar = {};
  const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!;
  const role = skjema.find((q) => q.rolle)!;
  const answer = (q: Sporsmal) => {
    if (q.vis && !q.vis(s)) return;
    onShow(q, { ...s });
    if (r() < 0.12) return; // skipped
    const source = q.valFraa ? ((s[q.valFraa] as string[] | undefined) ?? []) : null;
    const options = (q.val ?? []).filter(
      (o) => (!o.vis || o.vis(s)) && (!source || source.includes(o.id)),
    );
    if (q.type === 'single' && options.length) s[q.id] = pick(options).id;
    else if (q.type === 'multi' && options.length) {
      const n = 1 + Math.floor(r() * Math.min(q.maks ?? options.length, options.length));
      const chosen = [...options].sort(() => r() - 0.5).slice(0, n);
      const alone = chosen.find((o) => o.aleine);
      s[q.id] = alone ? [alone.id] : chosen.map((o) => o.id);
    } else if (q.type === 'text') s[q.id] = pick(['AB', 'noko', 'eit lengre svar']);
    else if (q.type === 'scale') {
      const rows = Object.fromEntries(
        (q.rader ?? []).filter(() => r() < 0.8).map((row) => [row.id, 1 + Math.floor(r() * 5)]),
      );
      if (Object.keys(rows).length) s[q.id] = rows;
    } else if (q.type === 'nps') s[q.id] = Math.floor(r() * 11);
  };
  skjema.filter((q) => q.del === 'A').forEach(answer);
  if (k.leiarRoller.includes(s[role.id] as string))
    skjema.filter((q) => q.del === 'B').forEach(answer);
  return s;
}

function check(k: Kartlegging, label: string, seed: number): number {
  const tpl = convertSkjema(k, 'ki');
  const src = k.skjema.ki!;
  const exprOf = new Map<string, Expression>();
  for (const q of tpl.questions) {
    if (q.visible_if !== undefined) exprOf.set(`vis:${q.id}`, q.visible_if);
    if ('options' in q)
      for (const o of q.options) if (o.visible_if) exprOf.set(`vis:${q.id}:${o.id}`, o.visible_if);
  }
  for (const t of tpl.tips) exprOf.set(`naar:${t.id}`, t.when);
  const fns: [string, (s: Svar) => unknown][] = [];
  for (const q of src.sporsmal) {
    if (q.vis) fns.push([`vis:${q.id}`, q.vis]);
    for (const o of q.val ?? []) if (o.vis) fns.push([`vis:${q.id}:${o.id}`, o.vis]);
  }
  for (const t of src.tips) fns.push([`naar:${t.id}`, t.naar]);
  expect(fns).toHaveLength(24);
  const r = rng(seed);
  let compared = 0;
  const same = (key: string, fn: (s: Svar) => unknown, s: Svar) => {
    const expected = Boolean(fn(s));
    const got = evaluate(exprOf.get(key)!, s as never);
    if (got !== expected)
      throw new Error(
        `${label} ${key} on ${JSON.stringify(s)}: source ${expected}, evaluate ${got}`,
      );
    compared += 1;
  };
  for (let i = 0; i < 2000; i += 1) {
    const s = generate(
      k,
      src.sporsmal,
      r,
      (q, partial) => q.vis && same(`vis:${q.id}`, q.vis, partial),
    );
    for (const [key, fn] of fns) same(key, fn, s);
  }
  return compared;
}

describe('source functions and evaluate() agree (1.2 property)', () => {
  it('KI 2026-10-13: 2000 generated answer sets', () => {
    expect(check(current, 'ki@2026-10-13', 20261013)).toBeGreaterThan(2000 * 24);
  });

  it('KI 2026-10-12: 2000 generated answer sets', () => {
    expect(check(old, 'ki@2026-10-12', 20261012)).toBeGreaterThan(2000 * 24);
  });
});
