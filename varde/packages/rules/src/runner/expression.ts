// Evaluation of the restricted JsonLogic of ADR-005 (1.6). No JsonLogic truthiness: `and`, `or`
// and `!` take booleans only (anything else counts as false); a comparison with a missing
// answer (null) is false; empty strings and arrays are "no answer" before evaluation.
import type { Expression } from '@varde/schema/template/expression';
import type { Answers } from './types.js';

type Value = string | number | boolean | null | readonly unknown[] | Record<string, unknown>;

function empty(v: unknown): Value {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  if (Array.isArray(v) && v.length === 0) return null;
  return v as Value;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

function lookup(name: string, answers: Answers, element: { value: unknown } | undefined): Value {
  if (element !== undefined) {
    if (name === '') return empty(element.value);
    const row = name.slice('rad.'.length);
    return isObject(element.value) ? empty(element.value[row]) : null;
  }
  const [id, row] = name.split('.');
  const v = empty(answers[id ?? '']);
  if (row === undefined) return v;
  return isObject(v) ? empty(v[row]) : null;
}

const primitive = (v: Value): v is string | number =>
  typeof v === 'string' || typeof v === 'number';

function compare(op: string, a: Value, b: Value): boolean {
  if (a === null || b === null) return false;
  if (op === '==') return primitive(a) && a === b;
  if (op === '!=') return primitive(a) && primitive(b) && a !== b;
  if (typeof a !== 'number' || typeof b !== 'number') return false;
  if (op === '>') return a > b;
  if (op === '>=') return a >= b;
  if (op === '<') return a < b;
  return a <= b;
}

function items(v: Value): readonly unknown[] {
  if (Array.isArray(v)) return v;
  if (isObject(v)) return [v];
  return [];
}

function run(expr: Expression, answers: Answers, element?: { value: unknown }): Value {
  if (typeof expr !== 'object' || Array.isArray(expr)) return expr;
  const [op, raw] = Object.entries(expr)[0] ?? ['', null];
  if (op === 'var') return lookup(raw as string, answers, element);
  const args = (Array.isArray(raw) ? raw : [raw]) as Expression[];
  const at = (i: number) => run(args[i] as Expression, answers, element);
  switch (op) {
    case 'and':
      return args.every((_, i) => at(i) === true);
    case 'or':
      return args.some((_, i) => at(i) === true);
    case '!':
      return at(0) !== true;
    case 'in': {
      const needle = at(0);
      const hay = at(1);
      if (needle === null || hay === null || !primitive(needle)) return false;
      if (Array.isArray(hay)) return hay.includes(needle);
      return typeof hay === 'string' && typeof needle === 'string' && hay.includes(needle);
    }
    case 'some':
    case 'count': {
      const list = items(at(0));
      const pred = args[1];
      const hits = list.filter(
        (value) => pred === undefined || run(pred, answers, { value }) === true,
      ).length;
      return op === 'some' ? hits > 0 : hits;
    }
    default:
      return compare(op, at(0), at(1));
  }
}

/** Evaluates a predicate; a non-boolean result is false. */
export function evaluate(expr: Expression, answers: Answers): boolean {
  return run(expr, answers) === true;
}

/** Evaluates any expression to its value (count → number, literals as they are). */
export function evaluateValue(expr: Expression, answers: Answers): unknown {
  return run(expr, answers);
}
