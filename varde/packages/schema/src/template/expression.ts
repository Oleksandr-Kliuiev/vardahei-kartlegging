// Restricted JsonLogic of template predicates (ADR-005): whitelisted operators, depth ≤ 6,
// `var` names a question of the version (`<id>` or `<id>.<row>` for a scale row); inside the
// predicate of `some`/`count` it names the element (`""`, or `rad.<row>` for a scale element).
// Literals: strings, numbers, arrays of strings. Evaluation lives in @varde/rules/runner (1.6).
import { z } from 'zod';

export const COMPARISON_OPERATORS = ['==', '!=', '>', '>=', '<', '<='] as const;
export const OPERATORS = [
  ...COMPARISON_OPERATORS,
  'in',
  'and',
  'or',
  '!',
  'var',
  'some',
  'count',
] as const;
export type Operator = (typeof OPERATORS)[number];
export const MAX_DEPTH = 6;

export type Literal = string | number | string[];
export interface ExpressionNode {
  [operator: string]: Expression | Expression[];
}
export type Expression = Literal | ExpressionNode;

export interface ExpressionIssue {
  message: string;
  path: (string | number)[];
}

const ID = /^[A-Za-z][A-Za-z0-9_]*$/;
const ELEMENT = /^(|rad\.[A-Za-z0-9_]+)$/;

function isLiteral(v: unknown): v is Literal {
  if (typeof v === 'string') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

const arity: Record<Exclude<Operator, 'var'>, [number, number]> = {
  '==': [2, 2],
  '!=': [2, 2],
  '>': [2, 2],
  '>=': [2, 2],
  '<': [2, 2],
  '<=': [2, 2],
  in: [2, 2],
  and: [1, 16],
  or: [1, 16],
  '!': [1, 1],
  some: [2, 2],
  count: [1, 2],
};

/** Structural check of an expression; `element` is true inside a some/count predicate. */
export function checkExpression(value: unknown, path: (string | number)[] = []): ExpressionIssue[] {
  const issues: ExpressionIssue[] = [];
  const walk = (v: unknown, p: (string | number)[], depth: number, element: boolean): void => {
    if (isLiteral(v)) return;
    if (depth > MAX_DEPTH) {
      issues.push({ message: `expression deeper than ${MAX_DEPTH}`, path: p });
      return;
    }
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      issues.push({ message: 'not an expression or literal', path: p });
      return;
    }
    const keys = Object.keys(v);
    if (keys.length !== 1) {
      issues.push({ message: 'an expression has exactly one operator', path: p });
      return;
    }
    const op = keys[0] as string;
    const arg = (v as Record<string, unknown>)[op];
    if (!(OPERATORS as readonly string[]).includes(op)) {
      issues.push({ message: `unknown operator ${op}`, path: [...p, op] });
      return;
    }
    if (op === 'var') {
      const ok = typeof arg === 'string' && (element ? ELEMENT.test(arg) : isRef(arg));
      if (!ok) issues.push({ message: `bad var ${JSON.stringify(arg)}`, path: [...p, op] });
      return;
    }
    const args = op === '!' && !Array.isArray(arg) ? [arg] : arg;
    const [min, max] = arity[op as Exclude<Operator, 'var'>];
    if (!Array.isArray(args) || args.length < min || args.length > max) {
      issues.push({ message: `${op} takes ${min}..${max} arguments`, path: [...p, op] });
      return;
    }
    args.forEach((a, i) => {
      const inner = (op === 'some' || op === 'count') && i === 1;
      walk(a, [...p, op, i], depth + 1, inner || element);
    });
  };
  walk(value, path, 1, false);
  return issues;
}

function isRef(name: string): boolean {
  const [id, row, ...rest] = name.split('.');
  return rest.length === 0 && ID.test(id ?? '') && (row === undefined || ID.test(row));
}

/** Question ids referenced by `var` outside some/count predicates (`K12.vurdere` → `K12`). */
export function expressionRefs(value: Expression): string[] {
  const refs = new Set<string>();
  const walk = (v: unknown, element: boolean): void => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return;
    for (const [op, arg] of Object.entries(v as Record<string, unknown>)) {
      if (op === 'var') {
        if (!element && typeof arg === 'string') refs.add(arg.split('.')[0] ?? arg);
        continue;
      }
      const args = Array.isArray(arg) ? arg : [arg];
      args.forEach((a, i) => walk(a, element || ((op === 'some' || op === 'count') && i === 1)));
    }
  };
  walk(value, false);
  return [...refs];
}

/** Scale-row references (`K12.vurdere`) as [question, row] pairs. */
export function rowRefs(value: Expression): [string, string][] {
  const out: [string, string][] = [];
  const walk = (v: unknown, element: boolean): void => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return;
    for (const [op, arg] of Object.entries(v as Record<string, unknown>)) {
      if (op === 'var') {
        const parts = typeof arg === 'string' ? arg.split('.') : [];
        if (!element && parts.length === 2) out.push([parts[0] ?? '', parts[1] ?? '']);
        continue;
      }
      const args = Array.isArray(arg) ? arg : [arg];
      args.forEach((a, i) => walk(a, element || ((op === 'some' || op === 'count') && i === 1)));
    }
  };
  walk(value, false);
  return out;
}

export const Expression = z.custom<Expression>().superRefine((value, ctx) => {
  for (const issue of checkExpression(value)) {
    ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
  }
});
