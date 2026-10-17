// What a question measures, without its words (2.16 acceptance): type, part, answers with their ids
// and scores, rows, scale, conditions and the frozen flag. Wording in every language, help, section
// titles and the anchor are left out, so a spelling fix keeps the structure and a changed answer,
// score or type does not. Publishing (ADR-005) and the metric definitions (ADR-020) read it.
import type { Question } from '@varde/schema/template/question';
import { canonical } from './hashes.js';

const LANGS = new Set(['nn', 'en', 'nb']);
/** A text in one or more languages: `{ nn, en?, nb? }`. */
const isWords = (v: unknown): boolean =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  typeof (v as { nn?: unknown }).nn === 'string' &&
  Object.keys(v).every((k) => LANGS.has(k));

function strip(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(strip);
  if (v === null || typeof v !== 'object') return v;
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>)
      .filter(([k, x]) => k !== 'texts' && k !== 'anchor_key' && !isWords(x))
      .map(([k, x]) => [k, strip(x)]),
  );
}

export const structureOf = (q: Question): string => canonical(strip(q));
