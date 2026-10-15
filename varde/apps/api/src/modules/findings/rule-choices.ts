// Which answers a rule may count (2.5): the buckets of its metric (aggregate and simple leader rules)
// or the options of its question (F12 × B13), labelled with texts of the latest published template
// version that has the question. Only rule definitions and templates are read here, never responses.
import { BadRequestException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { metricValues } from '@varde/rules/findings';
import { MetricDefinition } from '@varde/schema/metrics/metric-definition';
import type { Question } from '@varde/schema/template/question';
import type { TemplateContent } from '@varde/schema/template/template';
import { canonical } from '../surveys/hashes.js';
import type { FindingRule, RuleDraft } from './finding-rule.js';

export interface Choice {
  id: string;
  label: string;
  /** First part of a cross bucket (K7 × K8): the editor groups the choices by it. */
  group?: string;
}
export interface RuleContext {
  choices: Choice[];
  /** Simple leader rules match `raw_options`, which never change, so their options are fixed. */
  locked: boolean;
  /** Computed rules count hours or clients, not chosen answers. */
  countsAnswers: boolean;
  questions: { id: string; label: string }[];
}
type Db = Pick<PrismaClient, 'metricDefinition' | 'templateVersion'>;

export const familyOf = (key: string) => key.slice(0, key.indexOf('.'));
export const labelOf = (q: Question) => q.texts.short_label?.nn ?? q.texts.text.nn;
const optionText = (q: Question | undefined, id: string) =>
  (q && 'options' in q ? q.options.find((o) => o.id === id)?.texts.text.nn : undefined) ?? id;

/** Questions of a family by id, from the newest published version that has each of them. */
export async function familyQuestions(db: Db, family: string) {
  const versions = await db.templateVersion.findMany({
    where: { template: { key: family }, status: 'published' },
    orderBy: { version_no: 'desc' },
    select: { content: true },
  });
  return (id: string): Question | undefined => {
    for (const v of versions) {
      const q = (v.content as unknown as TemplateContent).questions.find((x) => x.id === id);
      if (q) return q;
    }
    return undefined;
  };
}

export async function metricOf(db: Db, key: string) {
  const row = await db.metricDefinition.findFirst({ where: { key }, orderBy: { version: 'desc' } });
  return row ? MetricDefinition.parse(row.definition) : undefined;
}

/** The questions a rule is about: those of its metric, then its own (B13 of F12 × B13). */
export function questionsOf(
  rule: FindingRule,
  def: MetricDefinition | undefined,
  question: (id: string) => Question | undefined,
) {
  const keys = def?.questions.map((q) => q.key) ?? [];
  return [...new Set([...keys, ...(rule.question ? [rule.question] : [])])].map((id) => {
    const q = question(id.split('.')[0] ?? id);
    return { id, label: q ? labelOf(q) : id };
  });
}

export async function ruleContext(db: Db, rule: FindingRule): Promise<RuleContext> {
  const question = await familyQuestions(db, familyOf(rule.key));
  const def = await metricOf(db, rule.metric_key);
  const keys = def?.questions.map((q) => q.key) ?? [];
  const questions = questionsOf(rule, def, question);
  const countsAnswers = !rule.computed || rule.computed === 'f12_b13';
  if (rule.computed === 'f12_b13') {
    const q = question(rule.question ?? '');
    const choices =
      q && 'options' in q ? q.options.map((o) => ({ id: o.id, label: optionText(q, o.id) })) : [];
    return { choices, locked: false, countsAnswers, questions };
  }
  if (!def || !countsAnswers) return { choices: [], locked: false, countsAnswers, questions };
  // A bucket is labelled and ordered by the answers that map to it, in the question's order.
  const answers = (qKey: string, value: string) => {
    const q = question(qKey.split('.')[0] ?? qKey);
    const order = q && 'options' in q ? q.options.map((o) => o.id) : [];
    const raw = Object.entries(def.options_mapping[qKey] ?? {})
      .filter(([, v]) => String(v) === value)
      .map(([o]) => o)
      .sort((x, y) => order.indexOf(x) - order.indexOf(y));
    const rank = Math.min(...raw.map((o) => order.indexOf(o)).filter((i) => i >= 0));
    return {
      label: raw.length ? raw.map((o) => optionText(q, o)).join(' / ') : value,
      rank: Number.isFinite(rank) ? rank : Number.MAX_SAFE_INTEGER,
    };
  };
  const [k1 = '', k2 = ''] = keys;
  const choices = metricValues(def, [])
    .map((v) => {
      const id = v.metric_key.slice(def.key.length + 1);
      if (def.kind !== 'cross') {
        const a = answers(k1, id);
        return { choice: { id, label: a.label }, rank: [a.rank, 0] };
      }
      const [x = '', y = ''] = id.split('.');
      const a = answers(k1, x),
        b = answers(k2, y);
      return {
        choice: { id, group: `${k1}: ${a.label}`, label: `${k2}: ${b.label}` },
        rank: [a.rank, b.rank],
      };
    })
    .sort((p, q) => p.rank[0]! - q.rank[0]! || p.rank[1]! - q.rank[1]!)
    .map((x): Choice => x.choice);
  return { choices, locked: rule.channel === 'leader', countsAnswers, questions };
}

const bad = (message: string) =>
  new BadRequestException({ message, issues: [{ path: ['options'], message }] });

/** Options of a new version: only answers that exist, at least one, fixed where the rule says so. */
export function checkOptions(
  current: FindingRule,
  draft: Pick<RuleDraft, 'options'>,
  ctx: RuleContext,
) {
  const same = canonical([...draft.options].sort()) === canonical([...current.options].sort());
  if (ctx.locked || !ctx.countsAnswers) {
    if (!same)
      throw bad(
        ctx.locked
          ? 'Svara i ein leiarregel ligg fast og kan ikkje endrast her.'
          : 'Denne regelen tel timar, ikkje svar. Svara kan ikkje endrast.',
      );
    return;
  }
  if (!draft.options.length) throw bad('Vel minst eitt svar som skal telje.');
  const valid = new Set(ctx.choices.map((c) => c.id));
  if (draft.options.some((o) => !valid.has(o))) throw bad('Vel berre svar som finst i spørsmålet.');
}
