// «Alle svar» (19.11, Oleksandr: every answer of everyone who has answered, nothing left out): each
// common question of the round in survey order, and one person's answer to it as Nynorsk text.
// Admin only, inside the audited rows read of RowsView.perEmployee (identified rounds).
import type { Question } from '@varde/schema/template/question';
import type { Scoring } from '@varde/rules/findings';
import type { PrivacyRow } from '../privacy/privacy.service.js';
import { labelOf } from './aggregate-view.js';

export interface AnswerQuestion {
  id: string;
  label: string;
  text: string;
}
export interface AnswerCell {
  /** The answer in words; null when the person gave none. */
  text: string | null;
  /** «Anna»: the person's own words beside a choice. */
  free: string | null;
  /** Points of the zone model (0 green … 3 red), when the answer is scored. */
  score: number | null;
}

/** The questions people answer, in survey order: the identifier field is not one. */
export function answerQuestions(questions: readonly Question[]): AnswerQuestion[] {
  return questions
    .filter((q) => q.part === 'common' && !q.identifier)
    .map((q) => ({ id: q.id, label: labelOf(q), text: q.texts.text.nn }));
}

function words(q: Question, v: unknown): string | null {
  if (v === undefined || v === null) return null;
  switch (q.type) {
    case 'single':
    case 'multi': {
      const ids = Array.isArray(v) ? v : [v];
      const text = ids
        .map((id) => q.options.find((o) => o.id === id)?.texts.text.nn ?? String(id))
        .join('; ');
      return text || null;
    }
    case 'text':
      return typeof v === 'string' && v.trim() ? v : null;
    case 'scale': {
      if (typeof v !== 'object') return null;
      const rows = q.rows.flatMap((r) => {
        const x = (v as Record<string, unknown>)[r.id];
        return typeof x === 'number' ? [`${r.texts.text.nn}: ${x}`] : [];
      });
      return rows.length ? rows.join('; ') : null;
    }
    case 'nps':
      return typeof v === 'number' ? String(v) : null;
  }
}

/** One person's answers to `questions`, in the same order. */
export function answerCells(
  questions: readonly Question[],
  row: PrivacyRow,
  table: Scoring,
): AnswerCell[] {
  return questions
    .filter((q) => q.part === 'common' && !q.identifier)
    .map((q) => {
      const v = row.answers[q.id];
      const free = row.free?.[q.id];
      const score = typeof v === 'string' ? table[q.id]?.[v] : undefined;
      return {
        text: words(q, v),
        free: typeof free === 'string' && free.trim() ? free : null,
        score: score ?? null,
      };
    });
}
