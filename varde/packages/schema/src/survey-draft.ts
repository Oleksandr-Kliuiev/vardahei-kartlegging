// Survey draft from a brief (task 0.14; later the assistant skill 2.8): the minimal shape the
// model returns through structured output (ADR-010) and the automatic checks of a draft
// (PRINCIPLES §3, ARCHITECTURE §6). Texts are nynorsk only. Drafts never contain frozen anchors
// (ADR-005), so the product stop list and the 25-word limit apply to every question.
import { z } from 'zod';
import { findBokmal } from './i18n/nn-stoplist.js';

export const DRAFT_QUESTION_TYPES = ['single', 'multi', 'scale', 'text'] as const;
export type DraftQuestionType = (typeof DRAFT_QUESTION_TYPES)[number];

// Descriptions are part of the JSON Schema the model sees, so they are written in nynorsk.
export const DraftOption = z.strictObject({
  id: z.string().describe('Kort id for alternativet: a, b, c …'),
  text: z.string().describe('Svaralternativet på nynorsk.'),
});

export const DraftQuestion = z.strictObject({
  id: z.string().describe('Kort id for spørsmålet: q1, q2 …'),
  type: z
    .enum(DRAFT_QUESTION_TYPES)
    .describe('single = eitt svar, multi = fleire svar, scale = skala, text = fritekst.'),
  text: z.string().describe('Spørsmålet på nynorsk, høgst 25 ord.'),
  options: z.array(DraftOption).describe('Svaralternativa. Tom liste når type er text.'),
  optional: z.boolean().describe('true når spørsmålet kan hoppast over.'),
});
export type DraftQuestion = z.infer<typeof DraftQuestion>;

export const SurveyDraft = z.strictObject({
  title: z.string().describe('Kort tittel på undersøkinga.'),
  intro: z.string().describe('Kort innleiing til dei som svarar.'),
  questions: z.array(DraftQuestion).describe('Spørsmåla i den rekkjefølgja dei blir stilte.'),
});
export type SurveyDraft = z.infer<typeof SurveyDraft>;

/**
 * JSON Schema of SurveyDraft for `output_config.format` of the Messages API. It stays inside
 * the structured-output subset: every object is closed, and there are no length or numeric
 * constraints (those are checked by draftIssues and checkDraft instead).
 */
export function surveyDraftJsonSchema(): Record<string, unknown> {
  const schema: Record<string, unknown> = { ...z.toJSONSchema(SurveyDraft) };
  delete schema.$schema;
  return schema;
}

/**
 * Product, service and vendor names that must not appear in question texts (PRINCIPLES §3).
 * Matched case-insensitively as whole words; multi-word entries match across whitespace.
 */
export const PRODUCT_STOPLIST: readonly string[] = [
  'Microsoft',
  'Microsoft 365',
  'Office 365',
  'Copilot',
  'Teams',
  'Outlook',
  'OneDrive',
  'SharePoint',
  'Exchange',
  'Excel',
  'Word',
  'PowerPoint',
  'Windows',
  'Entra',
  'Intune',
  'Defender',
  'Azure',
  'Google',
  'Gmail',
  'Google Drive',
  'Gemini',
  'Chrome',
  'Apple',
  'iPhone',
  'iPad',
  'Mac',
  'macOS',
  'iCloud',
  'Android',
  'Samsung',
  'ChatGPT',
  'OpenAI',
  'Claude',
  'Anthropic',
  'Perplexity',
  'Dropbox',
  'Zoom',
  'Slack',
  'WhatsApp',
  'Facebook',
  'Instagram',
  'LinkedIn',
  'Snapchat',
  'TikTok',
  'Vipps',
  'BankID',
  'Visma',
  'Tripletex',
  'PowerOffice',
  'Fiken',
  'LastPass',
  'Bitwarden',
  '1Password',
  'TeamViewer',
  'AnyDesk',
  'Adobe',
];

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PRODUCT_PATTERNS = PRODUCT_STOPLIST.map((name) => ({
  name,
  pattern: new RegExp(
    `(?<![\\p{L}\\p{N}])${name.split(' ').map(escape).join('\\s+')}(?![\\p{L}\\p{N}])`,
    'iu',
  ),
}));

/** Entries of PRODUCT_STOPLIST found in `text`, in list order. */
export function findProducts(text: string): string[] {
  return PRODUCT_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name);
}

export const MAX_QUESTION_WORDS = 25;

/** Words of `text`: whitespace-separated tokens with at least one letter or digit. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

const DONT_KNOW = /(?<![\p{L}])veit\s+ikkje(?![\p{L}])/iu;

/** «Veit ikkje» or skip is a normal answer (PRINCIPLES §3). */
export function allowsDontKnow(question: DraftQuestion): boolean {
  if (question.optional) return true;
  return question.type !== 'text' && question.options.some((o) => DONT_KNOW.test(o.text));
}

/** Structural problems the JSON Schema cannot express; any of them is a schema violation. */
export function draftIssues(draft: SurveyDraft): string[] {
  const issues: string[] = [];
  if (draft.title.trim() === '') issues.push('title is empty');
  if (draft.questions.length === 0) issues.push('no questions');
  const ids = new Set<string>();
  for (const q of draft.questions) {
    if (ids.has(q.id)) issues.push(`duplicate question id ${q.id}`);
    ids.add(q.id);
    if (q.text.trim() === '') issues.push(`${q.id}: empty text`);
    if (q.type === 'text' && q.options.length > 0)
      issues.push(`${q.id}: text question has options`);
    if (q.type !== 'text' && q.options.length < 2) issues.push(`${q.id}: fewer than 2 options`);
    const optionIds = new Set<string>();
    for (const o of q.options) {
      if (optionIds.has(o.id)) issues.push(`${q.id}: duplicate option id ${o.id}`);
      optionIds.add(o.id);
      if (o.text.trim() === '') issues.push(`${q.id}.${o.id}: empty text`);
    }
  }
  return issues;
}

export interface Finding {
  /** `title`, `intro`, a question id or `<question>.<option>`. */
  where: string;
  found: string[];
}

export interface DraftCheck {
  /** Structural issues (schema violation). */
  issues: string[];
  /** Bokmål forms of the shared nn stop list (mixed nn/nb). */
  bokmal: Finding[];
  /** Product names of PRODUCT_STOPLIST. */
  products: Finding[];
  /** Questions over MAX_QUESTION_WORDS: `<id> (<words>)`. */
  long_questions: string[];
  /** Questions without «veit ikkje» and not optional. */
  missing_dont_know: string[];
}

/** Every nynorsk text of the draft with its location. */
function texts(draft: SurveyDraft): [string, string][] {
  const out: [string, string][] = [
    ['title', draft.title],
    ['intro', draft.intro],
  ];
  for (const q of draft.questions) {
    out.push([q.id, q.text]);
    for (const o of q.options) out.push([`${q.id}.${o.id}`, o.text]);
  }
  return out;
}

/** Automatic checks of a parsed draft (schema, language, products, length, «veit ikkje»). */
export function checkDraft(draft: SurveyDraft): DraftCheck {
  const bokmal: Finding[] = [];
  const products: Finding[] = [];
  for (const [where, text] of texts(draft)) {
    const nb = findBokmal(text);
    if (nb.length > 0) bokmal.push({ where, found: nb });
    const names = findProducts(text);
    if (names.length > 0) products.push({ where, found: names });
  }
  return {
    issues: draftIssues(draft),
    bokmal,
    products,
    long_questions: draft.questions
      .filter((q) => countWords(q.text) > MAX_QUESTION_WORDS)
      .map((q) => `${q.id} (${countWords(q.text)})`),
    missing_dont_know: draft.questions.filter((q) => !allowsDontKnow(q)).map((q) => q.id),
  };
}
