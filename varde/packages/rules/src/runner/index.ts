/**
 * Entry point `@varde/rules/runner`: visibility, option dependencies, normalisation (1.6).
 * Must stay free of server code and of `@varde/rules/findings`. Re-exports by name only.
 */
export { optionsFor } from './choices.js';
export { evaluate, evaluateValue } from './expression.js';
export {
  FREE_TEXT_MAX_LENGTH,
  normalizeAnswers,
  normalizeFree,
  normalizeRespondentKey,
  RESPONDENT_KEY_LENGTH,
  TEXT_MAX_LENGTH,
  type Normalized,
} from './normalize.js';
export { isLeader, prune, visibleQuestions } from './path.js';
export type { Answers, AnswerValue, RawAnswers, RunnerVersion, ScaleAnswer } from './types.js';

/** Treats empty strings, whitespace-only strings and empty arrays as "no answer". */
export function normalizeEmpty<T>(value: T | '' | readonly unknown[] | null | undefined): T | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (Array.isArray(value) && value.length === 0) return null;
  return value as T;
}
