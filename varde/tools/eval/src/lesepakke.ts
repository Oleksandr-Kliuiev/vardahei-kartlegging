// Reading pack (lesepakke, nynorsk) and the empty scoring sheet for the rater (task 0.14).
// Simplified version: variants are labelled `<model>#<run>`, not blinded (decision 13.10).
import type { DraftQuestionType } from '@varde/schema/survey-draft';
import { evaluate, type RunRecord, variantLabel } from './record.js';

export interface BriefRuns {
  brief: string;
  text: string;
  records: RunRecord[];
}

const variantOf = (r: RunRecord): string => variantLabel(r.triple.model, r.run);

const TYPE_NN: Record<DraftQuestionType, string> = {
  single: 'eitt svar',
  multi: 'fleire svar',
  scale: 'skala',
  text: 'fritekst',
};

const quote = (text: string): string =>
  text
    .trim()
    .split('\n')
    .map((line) => (line === '' ? '>' : `> ${line}`))
    .join('\n');

function findingsNn(r: RunRecord): string[] {
  const c = r.checks;
  const out: string[] = [];
  if (r.auto_critical.length > 0) out.push(`Kritisk (automatisk): ${r.auto_critical.join(', ')}`);
  if (c.schema.length > 0) out.push(`Skjema: ${c.schema.join('; ')}`);
  for (const f of c.bokmal) out.push(`Bokmålsformer i ${f.where}: ${f.found.join(', ')}`);
  for (const f of c.products) out.push(`Produktnamn i ${f.where}: ${f.found.join(', ')}`);
  if (c.long_questions.length > 0) out.push(`Over 25 ord: ${c.long_questions.join(', ')}`);
  if (c.missing_dont_know.length > 0)
    out.push(`Utan «Veit ikkje» og kan ikkje hoppast over: ${c.missing_dont_know.join(', ')}`);
  return out.length > 0 ? out : ['Ingen funn.'];
}

function draftNn(r: RunRecord): string[] {
  if (r.response.stop_reason === 'refusal') {
    const category = r.response.stop_details?.category ?? 'utan kategori';
    return [`Modellen nekta å svare (refusal, ${category}). Det finst ikkje noko utkast.`];
  }
  const { draft } = evaluate(r.response.text, r.response.stop_reason);
  if (draft === null) return ['Svaret følgjer ikkje skjemaet:', '', '```', r.response.text, '```'];
  const lines = [`**Tittel:** ${draft.title}`, '', `**Innleiing:** ${draft.intro}`, ''];
  draft.questions.forEach((q, i) => {
    const skip = q.optional ? ' · kan hoppast over' : '';
    lines.push(`${i + 1}. ${q.text} _(${q.id}, ${TYPE_NN[q.type]}${skip})_`);
    for (const o of q.options) lines.push(`   - ${o.text}`);
  });
  return lines;
}

/** One section per brief: the brief, then each variant with its draft and automatic findings. */
export function renderLesepakke(briefs: BriefRuns[], header: string[]): string {
  const lines = ['# Lesepakke: utkast frå eval 0.14', '', ...header, ''];
  lines.push(
    'Les briefen, så utkastet. Vurder etter `varde/tools/eval/scoring-guide.md` og fyll ut',
    'éi rad per utkast i `varde/tools/eval/scores/<namnet ditt>.csv`.',
    '',
  );
  for (const b of briefs) {
    lines.push(`## ${b.brief}`, '', '### Brief', '', quote(b.text), '');
    for (const r of b.records) {
      lines.push(`### Utkast \`${variantOf(r)}\` (output \`${r.output_sha}\`)`, '');
      lines.push(...draftNn(r), '', '**Automatiske kontrollar:**', '');
      lines.push(...findingsNn(r).map((f) => `- ${f}`), '');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export const SHEET_COLUMNS = [
  'brief',
  'variant',
  'meaning_1_5',
  'naturalness_1_5',
  'edit_minutes',
  'critical_errors',
  'output_sha',
] as const;

/** Empty scoring sheet: one row per recorded output, automatic critical codes pre-filled. */
export function renderSheet(records: RunRecord[]): string {
  const rows = records.map((r) =>
    [r.brief, variantOf(r), '', '', '', r.auto_critical.join(' '), r.output_sha].join(','),
  );
  return `${[SHEET_COLUMNS.join(','), ...rows].join('\n')}\n`;
}
