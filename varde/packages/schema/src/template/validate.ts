// Consistency of a template version (ADR-005, ADR-019, ADR-025): references, cycles,
// choices_from, identifier/role, frozen anchors and languages. `TemplateVersionContent` is the
// schema every consumer parses (converter 1.2, publication 1.5, runner, import).
import { expressionRefs, rowRefs, type Expression } from './expression.js';
import { isChoice, type Question } from './question.js';
import { TemplateContentShape, type TemplateContent } from './template.js';
import { requireLanguages, type Lang, type LocalizedText } from './texts.js';

export interface TemplateIssue {
  message: string;
  path: (string | number)[];
}

const IDENTIFIER_MAX_LENGTH = 8;

/** Every localized text of the content with its path (the language gate of ADR-019). */
export function templateTexts(
  c: TemplateContent,
): { path: (string | number)[]; text: LocalizedText }[] {
  const out: { path: (string | number)[]; text: LocalizedText }[] = [];
  const add = (path: (string | number)[], text: LocalizedText | undefined) => {
    if (text !== undefined) out.push({ path, text });
  };
  const i = c.intro;
  add(['intro', 'title'], i.title);
  add(['intro', 'short'], i.short);
  i.letter.forEach((t, n) => add(['intro', 'letter', n], t));
  add(['intro', 'sender'], i.sender);
  i.facts.forEach((t, n) => add(['intro', 'facts', n], t));
  add(['intro', 'contact', 'hours'], i.contact.hours);
  add(['leader_intro', 'title'], c.leader_intro.title);
  add(['leader_intro', 'text'], c.leader_intro.text);
  c.score_scale?.levels.forEach((l, n) => add(['score_scale', 'levels', n, 'label'], l.label));
  c.tips.forEach((t, n) => {
    add(['tips', n, 'title'], t.title);
    add(['tips', n, 'text'], t.text);
  });
  for (const [key, t] of Object.entries(c.invitation ?? {})) add(['invitation', key], t);
  c.questions.forEach((q, n) => {
    const p = ['questions', n];
    for (const [key, t] of Object.entries(q.texts)) add([...p, 'texts', key], t);
    if (isChoice(q)) {
      q.options.forEach((o, m) => add([...p, 'options', m, 'texts', 'text'], o.texts.text));
      add([...p, 'scenario', 'explanation', 'title'], q.scenario?.explanation.title);
      add([...p, 'scenario', 'explanation', 'text'], q.scenario?.explanation.text);
    }
    if (q.type === 'scale')
      q.rows.forEach((r, m) => add([...p, 'rows', m, 'texts', 'text'], r.texts.text));
    if (q.type === 'scale' || q.type === 'nps') {
      add([...p, 'scale', 'low'], q.scale.low);
      add([...p, 'scale', 'high'], q.scale.high);
    }
    if (q.type !== 'text') add([...p, 'free_text', 'texts', 'text'], q.free_text?.texts.text);
  });
  return out;
}

const optionIds = (q: Question): string[] => (isChoice(q) ? q.options.map((o) => o.id) : []);

function questionExpressions(q: Question): Expression[] {
  const out: Expression[] = q.visible_if === undefined ? [] : [q.visible_if];
  if (isChoice(q))
    for (const o of q.options) if (o.visible_if !== undefined) out.push(o.visible_if);
  return out;
}

function hasCycle(edges: Map<string, string[]>): string | undefined {
  const state = new Map<string, 'open' | 'done'>();
  const visit = (id: string): string | undefined => {
    if (state.get(id) === 'done') return undefined;
    if (state.get(id) === 'open') return id;
    state.set(id, 'open');
    for (const next of edges.get(id) ?? []) {
      const found = visit(next);
      if (found !== undefined) return found;
    }
    state.set(id, 'done');
    return undefined;
  };
  for (const id of edges.keys()) {
    const found = visit(id);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function validateTemplate(c: TemplateContent): TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  const issue = (message: string, path: (string | number)[]) => issues.push({ message, path });
  const byId = new Map<string, Question>();
  const order = new Map<string, number>();
  c.questions.forEach((q, n) => {
    if (byId.has(q.id)) issue(`duplicate question id ${q.id}`, ['questions', n, 'id']);
    byId.set(q.id, q);
    order.set(q.id, n);
    const ids = q.type === 'scale' ? q.rows.map((r) => r.id) : optionIds(q);
    if (new Set(ids).size !== ids.length)
      issue(`duplicate option or row id in ${q.id}`, ['questions', n]);
  });

  const checkRefs = (expr: Expression, path: (string | number)[]) => {
    for (const ref of expressionRefs(expr)) {
      if (!byId.has(ref)) issue(`unknown question ${ref}`, path);
    }
    for (const [qid, row] of rowRefs(expr)) {
      const q = byId.get(qid);
      if (q !== undefined && (q.type !== 'scale' || !q.rows.some((r) => r.id === row))) {
        issue(`unknown row ${qid}.${row}`, path);
      }
    }
  };

  const edges = new Map<string, string[]>();
  c.questions.forEach((q, n) => {
    const p = ['questions', n];
    const deps = questionExpressions(q).flatMap((e) => expressionRefs(e));
    if (q.visible_if !== undefined) checkRefs(q.visible_if, [...p, 'visible_if']);
    if (q.frozen && q.anchor_key === undefined)
      issue(`frozen ${q.id} needs anchor_key`, [...p, 'anchor_key']);
    if (isChoice(q)) {
      const ids = new Set(optionIds(q));
      q.options.forEach((o, m) => {
        if (o.visible_if !== undefined) checkRefs(o.visible_if, [...p, 'options', m, 'visible_if']);
      });
      for (const [field, list] of [
        ['exclusive_options', q.exclusive_options],
        ['free_text', q.free_text?.when],
        ['scenario', q.scenario?.correct_options],
      ] as const) {
        for (const id of list ?? [])
          if (!ids.has(id)) issue(`${field}: unknown option ${id}`, [...p, field]);
      }
      if (q.choices_from !== undefined) {
        const src = byId.get(q.choices_from);
        deps.push(q.choices_from);
        if (src === undefined)
          issue(`choices_from: unknown question ${q.choices_from}`, [...p, 'choices_from']);
        else if (src.type !== 'multi' || (order.get(src.id) ?? n) >= n) {
          issue('choices_from must name a multi question earlier in order', [...p, 'choices_from']);
        }
      }
      if (
        q.type === 'multi' &&
        q.min_choices !== undefined &&
        q.max_choices !== undefined &&
        q.min_choices > q.max_choices
      ) {
        issue('min_choices > max_choices', [...p, 'min_choices']);
      }
    }
    if (q.type === 'scale' && q.scale.min >= q.scale.max)
      issue('scale.min must be < scale.max', [...p, 'scale']);
    edges.set(
      q.id,
      deps.filter((d) => byId.has(d)),
    );
  });
  const cycle = hasCycle(edges);
  if (cycle !== undefined) issue(`visible_if cycle through ${cycle}`, ['questions']);
  c.tips.forEach((t, n) => checkRefs(t.when, ['tips', n, 'when']));

  const identifiers = c.questions.filter((q) => q.identifier);
  if (c.identification === 'initials') {
    if (identifiers.length !== 1)
      issue('identification initials needs exactly one identifier', ['questions']);
    for (const q of identifiers) {
      const ok =
        q.type === 'text' && q.single_line && (q.max_length ?? Infinity) <= IDENTIFIER_MAX_LENGTH;
      if (!ok)
        issue(`identifier ${q.id} must be a single-line text of ≤ 8 characters`, ['questions']);
      if (q.part !== 'common')
        issue(`identifier ${q.id} must be in the common part`, ['questions']);
    }
  } else if (identifiers.length > 0) {
    issue('identification none has no identifier', ['questions']);
  }

  const roles = c.questions.filter((q) => q.role);
  if (roles.length !== 1) issue('exactly one role question', ['questions']);
  const roleOptions = new Set(roles[0] === undefined ? [] : optionIds(roles[0]));
  c.leader_roles.forEach((r, n) => {
    if (!roleOptions.has(r))
      issue(`leader role ${r} is not an option of the role question`, ['leader_roles', n]);
  });

  const langs = new Set(c.required_languages);
  const needed: Lang[] = c.audience === 'client_survey' ? ['nn', 'en'] : ['nn'];
  for (const lang of needed) {
    if (!langs.has(lang)) issue(`${c.audience} requires ${lang}`, ['required_languages']);
  }
  for (const { path, text } of templateTexts(c)) {
    // Admin-facing labels (dashboard short label, zone names) are nn only (kartlegging `kort`, SONER).
    const adminLabel = path.includes('short_label') || path[0] === 'score_scale';
    const langs = adminLabel ? (['nn'] as Lang[]) : c.required_languages;
    for (const lang of requireLanguages(text, langs)) issue(`missing ${lang}`, path);
  }
  return issues;
}

export const TemplateVersionContent = TemplateContentShape.superRefine((c, ctx) => {
  for (const i of validateTemplate(c))
    ctx.addIssue({ code: 'custom', message: i.message, path: i.path });
});
