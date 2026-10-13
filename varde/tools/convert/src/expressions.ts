// Hand-written JsonLogic for every function in sporsmal.js (1.2): `vis` of a question, `vis` of
// an option and `naar` of a tip. Functions are not parsed; the entry also stores the function
// source, so a changed function in kartlegging stops the converter instead of drifting.
import type { Expression } from '@varde/schema/template/expression';
import type { Fn } from './kartlegging.js';

const v = (id: string) => ({ var: id });
const notIngen = { '!=': [v(''), 'ingen'] };
/** rutine(s).length — K3 without «ingen». */
const routine = { count: [v('K3'), notIngen] };
/** praktisk(s): s.K1 === "prod" || K2 contains "praktisk". */
const practical: Expression = { or: [{ '==': [v('K1'), 'prod'] }, { in: ['praktisk', v('K2')] }] };
/** brukarKI(s): K7 or K8 answered and not «aldri». */
const usesAi: Expression = { or: [{ '!=': [v('K7'), 'aldri'] }, { '!=': [v('K8'), 'aldri'] }] };
/** lav(s, id, rad): the scale row answered and ≤ 2. */
const low = (id: string, row: string): Expression => ({ '<=': [v(`${id}.${row}`), 2] });
const has = (id: string, option: string): Expression => ({ in: [option, v(id)] });

const PRAKTISK =
  'function praktisk(s) { return s.K1 === "prod" || (!!s.K2 && s.K2.indexOf("praktisk") > -1); }';
const BRUKAR_KI =
  'function brukarKI(s) { var j = s.K7, p = s.K8; return (j && j !== "aldri") || (p && p !== "aldri"); }';

interface Entry {
  source: string;
  expr: Expression;
}

const practicalOptions = ['timar', 'sjekkliste', 'dokumentere', 'delar'];

export const EXPRESSIONS: Record<string, Entry> = {
  'vis:K16': {
    source: 'function (s) { return rutine(s).length >= 2; }',
    expr: { '>=': [routine, 2] },
  },
  'vis:K17': {
    source: 'function (s) { return rutine(s).length >= 1; }',
    expr: { '>=': [routine, 1] },
  },
  'vis:K18': {
    source: 'function (s) { return rutine(s).length >= 1; }',
    expr: { '>=': [routine, 1] },
  },
  'vis:K4': {
    source: 'function (s) { return !(s.K3 && s.K3.length === 1 && s.K3[0] === "ingen"); }',
    expr: { '!': [{ and: [{ '==': [{ count: [v('K3')] }, 1] }, has('K3', 'ingen')] }] },
  },
  'vis:K20': {
    source: 'function (s) { return !!s.K6 && s.K6 !== "sjeldan"; }',
    expr: { '!=': [v('K6'), 'sjeldan'] },
  },
  'vis:K11': { source: BRUKAR_KI, expr: usesAi },
  'vis:K19': { source: BRUKAR_KI, expr: usesAi },
  'vis:K12': { source: BRUKAR_KI, expr: usesAi },
  ...Object.fromEntries(
    ['K3', 'K16'].flatMap((q) =>
      practicalOptions.map((o) => [`vis:${q}:${o}`, { source: PRAKTISK, expr: practical }]),
    ),
  ),
  'naar:start': {
    source:
      'function (s) { return s.K9 === "n0" || s.K9 === "n1" || s.K7 === "aldri" || s.K7 === "provd"; }',
    expr: { or: [{ in: [v('K9'), ['n0', 'n1']] }, { in: [v('K7'), ['aldri', 'provd']] }] },
  },
  'naar:lov': { source: 'function (s) { return har(s, "K13", "lov"); }', expr: has('K13', 'lov') },
  'naar:data': {
    source:
      'function (s) { return har(s, "K13", "data") || s.K19 === "privat" || s.K19 === "begge" || s.K21 === "lim" || s.K21 === "vk"; }',
    expr: {
      or: [
        has('K13', 'data'),
        { in: [v('K19'), ['privat', 'begge']] },
        { in: [v('K21'), ['lim', 'vk']] },
      ],
    },
  },
  'naar:stolar': {
    source: 'function (s) { return har(s, "K13", "stolar") || lav(s, "K12", "vurdere"); }',
    expr: { or: [has('K13', 'stolar'), low('K12', 'vurdere')] },
  },
  'naar:kva': {
    source: 'function (s) { return har(s, "K13", "kva") || har(s, "K13", "passar"); }',
    expr: { or: [has('K13', 'kva'), has('K13', 'passar')] },
  },
  'naar:tid': {
    source: 'function (s) { return har(s, "K13", "tid") || lav(s, "K12", "sporje"); }',
    expr: { or: [has('K13', 'tid'), low('K12', 'sporje')] },
  },
  'naar:framme': {
    source:
      'function (s) { return (s.K9 === "n3" || s.K9 === "n4") && s.K21 === "jobb" && !lav(s, "K12", "vurdere"); }',
    expr: {
      and: [
        { in: [v('K9'), ['n3', 'n4']] },
        { '==': [v('K21'), 'jobb'] },
        { '!': [low('K12', 'vurdere')] },
      ],
    },
  },
  'naar:oppgave': {
    source: 'function (s) { return !!(s.K15 || (s.K3 && s.K3.length && s.K3[0] !== "ingen")); }',
    expr: { or: [{ '!=': [v('K15'), ''] }, { some: [v('K3'), notIngen] }] },
  },
};

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The expression for the function at `key`; unknown key or changed source → error. */
export function expressionFor(key: string, fn: Fn): Expression {
  const entry = EXPRESSIONS[key];
  if (entry === undefined) throw new Error(`converter: no expression for ${key}`);
  if (squash(fn.toString()) !== squash(entry.source)) {
    throw new Error(`converter: ${key} changed in sporsmal.js:\n${squash(fn.toString())}`);
  }
  return entry.expr;
}
