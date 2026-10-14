import type { TemplateContent } from '@varde/schema/template/template';
import { csv } from './csv.js';

export const ANALYSE_HEADER = [
  'Initialar',
  'Kunde',
  'Spørsmål',
  'Svar',
  'Risiko',
  'Rang',
  'Rolle',
  'Skjema',
  'Del',
  'Spørsmål-ID',
  'Svar-ID',
  'Dato',
  'Svar-nr',
];
export interface AnalyseRow {
  respondent_key?: string | undefined;
  source_id?: string | null | undefined;
  submission_id?: string | undefined;
  client: string;
  role: string;
  part: string;
  answers: Readonly<Record<string, unknown>>;
  free?: Readonly<Record<string, unknown>> | undefined;
  submitted_day: string;
}
/** Matches kartlegging/lib/analyse-eksport.js, with part selected by the privacy caller. */
export function analyseRows(
  content: TemplateContent,
  rows: readonly AnalyseRow[],
  clients: ReadonlyMap<string, string>,
): unknown[][] {
  const out: unknown[][] = [];
  const roleQ = content.questions.find((q) => q.role);
  for (const r of rows) {
    const role =
      roleQ && 'options' in roleQ
        ? (roleQ.options.find((o) => o.id === r.role)?.texts.text.nn ?? r.role)
        : r.role;
    for (const q of content.questions.filter((q) => q.part === r.part && !q.identifier)) {
      const rad = (text: string, value: unknown, id: string, score?: number, question = q.id) =>
        out.push([
          r.respondent_key ?? '',
          clients.get(r.client) ?? r.client,
          text,
          value,
          score === undefined ? '' : ['Grøn', 'Gul', 'Oransje', 'Raud'][score],
          score === undefined ? '' : score + 1,
          role,
          content.intro.title.nn,
          r.part === 'leader' ? 'B' : 'A',
          question,
          id,
          r.submitted_day,
          r.source_id ?? r.submission_id,
        ]);
      const value = r.answers[q.id];
      if (value != null) {
        if (q.type === 'single' || q.type === 'multi') {
          for (const id of Array.isArray(value) ? value : [value]) {
            const option = q.options.find((o) => o.id === id);
            rad(q.texts.text.nn, option?.texts.text.nn ?? id, String(id), option?.score);
          }
        } else if (q.type === 'scale' && typeof value === 'object') {
          for (const row of q.rows) {
            const v = (value as Record<string, unknown>)[row.id];
            if (v != null)
              rad(
                q.texts.text.nn + ' – ' + row.texts.text.nn,
                v,
                row.id,
                undefined,
                `${q.id}.${row.id}`,
              );
          }
        } else rad(q.texts.text.nn, value, '');
      }
      if (r.free?.[q.id])
        rad(q.texts.text.nn + ' (fritekst)', r.free[q.id], '', undefined, `${q.id}.fri`);
    }
  }
  return out;
}
export const analyseCsv = (rows: readonly (readonly unknown[])[]) => csv(ANALYSE_HEADER, rows);
