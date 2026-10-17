// Conditions in the workshop (2.15): the simple JsonLogic forms read as rules and as a Nynorsk sentence.
// Anything else (count, some, scale rows, nesting) stays an advanced condition: shown in words as far
// as it goes and edited as JSON under «Teknisk». Only earlier choice questions can be chosen, so the
// rules the workshop writes never refer forward and never make a cycle.
import type { Expression } from '../../../packages/schema/src/template/expression.js';
import type { Question } from '../../../packages/schema/src/template/question.js';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import { ordered } from './verkstad-model.js';

export type Op = 'er' | 'er_ikkje' | 'er_ein_av' | 'inneheld' | 'inneheld_ikkje';
export interface Rule {
  q: string;
  op: Op;
  /** Answer ids: one, or several for `er_ein_av`. */
  v: string[];
}
export interface Condition {
  logic: 'og' | 'eller';
  rules: Rule[];
}
export const OPS: Record<'single' | 'multi', readonly (readonly [Op, string])[]> = {
  single: [
    ['er', 'er'],
    ['er_ikkje', 'er ikkje'],
    ['er_ein_av', 'er ein av'],
  ],
  multi: [
    ['inneheld', 'har valt'],
    ['inneheld_ikkje', 'har ikkje valt'],
  ],
};

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const varOf = (x: unknown): string | null =>
  isObj(x) &&
  Object.keys(x).length === 1 &&
  typeof x['var'] === 'string' &&
  /^[A-Za-z][A-Za-z0-9_]*$/.test(x['var'])
    ? x['var']
    : null;
const strings = (x: unknown): x is string[] =>
  Array.isArray(x) && x.length > 0 && x.every((s) => typeof s === 'string');

function readRule(e: unknown): Rule | null {
  if (!isObj(e) || Object.keys(e).length !== 1) return null;
  const [op] = Object.keys(e) as [string];
  const arg = e[op];
  if ((op === '==' || op === '!=') && Array.isArray(arg) && arg.length === 2) {
    const q = varOf(arg[0]);
    if (q && typeof arg[1] === 'string')
      return { q, op: op === '==' ? 'er' : 'er_ikkje', v: [arg[1]] };
  }
  if (op === 'in' && Array.isArray(arg) && arg.length === 2) {
    const one = varOf(arg[0]);
    if (one && strings(arg[1])) return { q: one, op: 'er_ein_av', v: arg[1] };
    const many = varOf(arg[1]);
    if (many && typeof arg[0] === 'string') return { q: many, op: 'inneheld', v: [arg[0]] };
  }
  if (op === '!') {
    const inner: unknown = Array.isArray(arg)
      ? arg.length === 1
        ? (arg[0] as unknown)
        : null
      : arg;
    const r = readRule(inner);
    if (r?.op === 'inneheld') return { ...r, op: 'inneheld_ikkje' };
  }
  return null;
}

/** `null`: always shown; `'avansert'`: a form the rule editor does not cover. */
export function readCondition(e: Expression | undefined): Condition | null | 'avansert' {
  if (e === undefined) return null;
  const one = readRule(e);
  if (one) return { logic: 'og', rules: [one] };
  if (isObj(e) && Object.keys(e).length === 1) {
    const [op] = Object.keys(e) as [string];
    const list = e[op];
    if ((op === 'and' || op === 'or') && Array.isArray(list) && list.length) {
      const rules = list.map(readRule);
      if (rules.every((r): r is Rule => r !== null))
        return { logic: op === 'and' ? 'og' : 'eller', rules };
    }
  }
  return 'avansert';
}

export const complete = (r: Rule) => r.q !== '' && r.v.length > 0 && r.v.every((v) => v !== '');

export function writeRule(r: Rule): Expression {
  const v = { var: r.q };
  const one = r.v[0] ?? '';
  switch (r.op) {
    case 'er':
      return { '==': [v, one] };
    case 'er_ikkje':
      return { '!=': [v, one] };
    case 'er_ein_av':
      return { in: [v, r.v] };
    case 'inneheld':
      return { in: [one, v] };
    case 'inneheld_ikkje':
      return { '!': [{ in: [one, v] }] };
  }
}
/** Only complete rules are written; none left means «always shown». */
export function writeCondition(c: Condition): Expression | undefined {
  const rules = c.rules.filter(complete);
  if (!rules.length) return undefined;
  return rules.length === 1
    ? writeRule(rules[0]!)
    : { [c.logic === 'og' ? 'and' : 'or']: rules.map(writeRule) };
}

/** Earlier choice questions a condition of `q` may use (common ones, and earlier leader ones for leader questions). */
export function sourcesFor(c: TemplateContent, q: Question): Question[] {
  const order = ordered(c);
  const i = order.findIndex((x) => x.id === q.id);
  return order
    .slice(0, i < 0 ? order.length : i)
    .filter(
      (x) =>
        (x.type === 'single' || x.type === 'multi') && (x.part === 'common' || q.part === 'leader'),
    );
}

export const shortName = (q: Question) => {
  const s = q.texts.short_label?.nn || q.texts.text.nn || 'Nytt spørsmål';
  return s.length > 40 ? `${s.slice(0, 39).trimEnd()} …` : s;
};
const answerText = (q: Question | undefined, id: string) =>
  (q && (q.type === 'single' || q.type === 'multi')
    ? q.options.find((o) => o.id === id)?.texts.text.nn
    : undefined) || id;

function ruleWords(c: TemplateContent, r: Rule): string {
  const src = c.questions.find((q) => q.id === r.q);
  const name = src ? `${src.id} «${shortName(src)}»` : r.q;
  const vals = r.v.map((v) => `«${answerText(src, v)}»`);
  switch (r.op) {
    case 'er':
      return `${name} er ${vals[0] ?? '…'}`;
    case 'er_ikkje':
      return `${name} ikkje er ${vals[0] ?? '…'}`;
    case 'er_ein_av':
      return `${name} er ${vals.join(' eller ') || '…'}`;
    case 'inneheld':
      return `${vals[0] ?? '…'} er valt i ${name}`;
    case 'inneheld_ikkje':
      return `${vals[0] ?? '…'} ikkje er valt i ${name}`;
  }
}
export function conditionWords(c: TemplateContent, cond: Condition): string {
  const rules = cond.rules.filter(complete);
  if (!rules.length) return 'Blir alltid vist.';
  return `Blir berre vist når ${rules.map((r) => ruleWords(c, r)).join(cond.logic === 'og' ? ' og ' : ' eller ')}.`;
}

/** Words for any condition: the rule forms, and the counting and comparing forms the KI survey uses. */
export function expressionWords(c: TemplateContent, e: Expression): string {
  const read = readCondition(e);
  if (read && read !== 'avansert') return conditionWords(c, read);
  return `Blir berre vist når ${partWords(c, e)}.`;
}
function partWords(c: TemplateContent, e: unknown): string {
  const rule = readRule(e);
  if (rule) return ruleWords(c, rule);
  if (!isObj(e) || Object.keys(e).length !== 1) return JSON.stringify(e);
  const [op] = Object.keys(e) as [string];
  const arg = e[op];
  const args = Array.isArray(arg) ? arg : [arg];
  if (op === 'and' || op === 'or')
    return args.map((a) => partWords(c, a)).join(op === 'and' ? ' og ' : ' eller ');
  if (op === '!') return `ikkje (${partWords(c, args[0])})`;
  const cmp: Record<string, string> = {
    '>=': 'minst',
    '<=': 'høgst',
    '>': 'meir enn',
    '<': 'mindre enn',
  };
  if (cmp[op] && args.length === 2) {
    const [left, right] = args as unknown[];
    if (isObj(left) && Array.isArray(left['count'])) {
      const q = varOf(left['count'][0]);
      return `${cmp[op]} ${String(right)} val i ${q ?? '…'}`;
    }
    const ref = isObj(left) && typeof left['var'] === 'string' ? left['var'] : null;
    if (ref) {
      const [qid, row] = ref.split('.');
      return `${qid}${row ? `, rad «${row}»,` : ''} er ${cmp[op]} ${String(right)}`;
    }
  }
  if (op === 'some' && args.length === 2) return `eitt av vala i ${varOf(args[0]) ?? '…'} passar`;
  return JSON.stringify(e);
}
