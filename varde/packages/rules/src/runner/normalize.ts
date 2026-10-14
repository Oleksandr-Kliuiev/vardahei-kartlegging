// Server normalizer (1.6, ADR-005, ADR-025): the same rules as kartlegging server.js::valider
// plus exclusive options; the identifier answer becomes `respondent_key` and leaves `answers`.
import type { Question } from '@varde/schema/template/question';
import type { Answers, AnswerValue, RawAnswers, RunnerVersion } from './types.js';

export const TEXT_MAX_LENGTH = 1500;
export const FREE_TEXT_MAX_LENGTH = 800;
export const RESPONDENT_KEY_LENGTH = 8;

export interface Normalized {
  answers: Answers;
  respondent_key: string | null;
  /** Answers dropped as unknown question, unknown option or out of range. */
  dropped: number;
}

/** trim, upper case, first 8 characters (kartlegging server.js 181); empty → null. */
export function normalizeRespondentKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toUpperCase().slice(0, RESPONDENT_KEY_LENGTH);
  return key === '' ? null : key;
}

function choice(q: Question & { type: 'single' | 'multi' }, v: unknown): AnswerValue | undefined {
  const ids = new Set(q.options.map((o) => o.id));
  if (q.type === 'single') return typeof v === 'string' && ids.has(v) ? v : undefined;
  if (!Array.isArray(v)) return undefined;
  let picked = [...new Set(v.filter((x): x is string => typeof x === 'string' && ids.has(x)))];
  const exclusive = picked.find((x) => q.exclusive_options?.includes(x));
  if (exclusive !== undefined) picked = [exclusive];
  if (picked.length === 0) return undefined;
  if (q.max_choices !== undefined && picked.length > q.max_choices) return undefined;
  return picked;
}

function value(q: Question, v: unknown): AnswerValue | undefined {
  switch (q.type) {
    case 'single':
    case 'multi':
      return choice(q, v);
    case 'text': {
      if (typeof v !== 'string' || v.trim() === '') return undefined;
      const t = v.trim().slice(0, q.max_length ?? TEXT_MAX_LENGTH);
      return q.uppercase ? t.toUpperCase() : t;
    }
    case 'scale': {
      if (v === null || typeof v !== 'object' || Array.isArray(v)) return undefined;
      const out: Record<string, number> = {};
      for (const row of q.rows) {
        const x = (v as Record<string, unknown>)[row.id];
        if (Number.isInteger(x) && (x as number) >= q.scale.min && (x as number) <= q.scale.max) {
          out[row.id] = x as number;
        }
      }
      return Object.keys(out).length > 0 ? out : undefined;
    }
    case 'nps':
      return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10
        ? (v as number)
        : undefined;
  }
}

const isEmpty = (v: unknown) =>
  v === undefined ||
  v === null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

export function normalizeAnswers(version: RunnerVersion, raw: RawAnswers): Normalized {
  const byId = new Map(version.questions.map((q) => [q.id, q]));
  const answers: Answers = {};
  let respondentKey: string | null = null;
  let dropped = 0;
  for (const [id, v] of Object.entries(raw)) {
    if (isEmpty(v)) continue;
    const q = byId.get(id);
    if (q === undefined) {
      dropped += 1;
      continue;
    }
    if (q.identifier) {
      respondentKey = version.identification === 'initials' ? normalizeRespondentKey(v) : null;
      continue;
    }
    const out = value(q, v);
    if (out === undefined) dropped += 1;
    else answers[id] = out;
  }
  return { answers, respondent_key: respondentKey, dropped };
}

/** Free texts (`fri`): trimmed, ≤ 800 characters, only for questions of the version. */
export function normalizeFree(version: RunnerVersion, raw: RawAnswers): Record<string, string> {
  const ids = new Set(version.questions.filter((q) => !q.identifier).map((q) => q.id));
  const out: Record<string, string> = {};
  for (const [id, t] of Object.entries(raw)) {
    if (ids.has(id) && typeof t === 'string' && t.trim() !== '') {
      out[id] = t.trim().slice(0, FREE_TEXT_MAX_LENGTH);
    }
  }
  return out;
}
