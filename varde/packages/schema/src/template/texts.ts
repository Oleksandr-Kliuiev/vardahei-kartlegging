// Localized texts of a template version (ADR-005, ADR-019): nn is the source language, en is a
// required translation of client surveys, nb is enabled per template by a switch.
import { z } from 'zod';

export const LANGS = ['nn', 'en', 'nb'] as const;
export const Lang = z.enum(LANGS);
export type Lang = z.infer<typeof Lang>;

/** Empty strings are allowed (a scale with one row has no row label, B14 in kartlegging). */
export const LocalizedText = z.strictObject({
  nn: z.string(),
  en: z.string().optional(),
  nb: z.string().optional(),
});
export type LocalizedText = z.infer<typeof LocalizedText>;

/** Languages of `langs` that `text` lacks. */
export function requireLanguages(text: LocalizedText, langs: readonly Lang[]): Lang[] {
  return langs.filter((lang) => typeof text[lang] !== 'string');
}
