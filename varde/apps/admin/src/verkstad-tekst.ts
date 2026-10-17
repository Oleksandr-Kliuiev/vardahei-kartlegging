// Texts and versions in the workshop (2.16): what changed between two versions, every text by its
// stable key (the translation view writes through it), and what changed since a language was approved.
import type { Question } from '../../../packages/schema/src/template/question.js';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import {
  respondentTexts,
  type RespondentText,
} from '../../../packages/schema/src/template/respondent-texts.js';
import type { ApprovalBasis } from './survey-models.js';
import { withoutAnchor, type Lang } from './verkstad-model.js';

export interface QuestionDiff {
  added: Question[];
  changed: { before: Question; now: Question }[];
  removed: Question[];
}
/** Questions new, changed (wording, answers, settings or anchor) and removed since `base`; moves are no change. */
export function diffQuestions(base: TemplateContent | null, c: TemplateContent): QuestionDiff {
  if (!base) return { added: [], changed: [], removed: [] };
  const before = new Map(base.questions.map((q) => [q.id, q]));
  const now = new Map(c.questions.map((q) => [q.id, q]));
  return {
    added: c.questions.filter((q) => !before.has(q.id)),
    changed: c.questions.flatMap((q) => {
      const b = before.get(q.id);
      return b && (withoutAnchor(b) !== withoutAnchor(q) || b.anchor_key !== q.anchor_key)
        ? [{ before: b, now: q }]
        : [];
    }),
    removed: base.questions.filter((q) => !now.has(q.id)),
  };
}

type Words = RespondentText['text'];
/** The text object under a key in `c` (to read, or to change in a copy). */
function textAt(c: TemplateContent, key: string): Words | undefined {
  const [head, a, b, d] = key.split('.');
  if (head === 'intro') {
    if (a === 'letter' || a === 'facts') return c.intro[a][Number(b)];
    if (a === 'contact') return c.intro.contact.hours;
    return a === 'title' || a === 'short' || a === 'sender' ? c.intro[a] : undefined;
  }
  if (head === 'invitation')
    return a === 'letter'
      ? c.invitation?.letter
      : b === 'title' || b === 'text' || b === 'footer'
        ? c.invitation?.poster[b]
        : undefined;
  if (head === 'leader') return a === 'title' || a === 'text' ? c.leader_intro[a] : undefined;
  if (head === 'tip') {
    const tip = c.tips[Number(a)];
    return b === 'title' || b === 'text' ? tip?.[b] : undefined;
  }
  const q = c.questions.find((x) => x.id === a);
  if (head !== 'q' || !q) return undefined;
  if (b === 'text' || b === 'help' || b === 'placeholder') return q.texts[b];
  if (b === 'section') return q.texts.section_title;
  if (b === 'option' && 'options' in q) return q.options.find((o) => o.id === d)?.texts.text;
  if (b === 'scenario' && 'options' in q)
    return d === 'title' || d === 'text' ? q.scenario?.explanation[d] : undefined;
  if (b === 'row' && q.type === 'scale') return q.rows.find((r) => r.id === d)?.texts.text;
  if ((b === 'low' || b === 'high') && (q.type === 'scale' || q.type === 'nps')) return q.scale[b];
  if (b === 'free' && q.type !== 'text') return q.free_text?.texts.text;
  return undefined;
}
/** `c` with one text changed in one language; the same `c` when the key does not exist. */
export function withText(
  c: TemplateContent,
  key: string,
  lang: Lang,
  value: string,
): TemplateContent {
  if (!textAt(c, key)) return c;
  const next = structuredClone(c);
  const t = textAt(next, key)!;
  t[lang] = value;
  return next;
}

/** Texts changed since `lang` was approved: its own words, or (a translation) its Nynorsk source. */
export function changedSince(
  basis: ApprovalBasis | undefined,
  c: TemplateContent,
  lang: Lang,
): RespondentText[] {
  if (!basis) return [];
  return respondentTexts(c).filter((t) => {
    const was = basis.texts[t.key];
    if (!was) return t.text.nn.trim() !== '' || (t.text[lang] ?? '').trim() !== '';
    return (t.text[lang] ?? '') !== (was[lang] ?? '') || (lang !== 'nn' && t.text.nn !== was.nn);
  });
}
