/**
 * Bokmål word forms that must not appear in nynorsk text.
 * Shared by the text checks (0.18) and the eval (0.14). Only forms that are never valid nynorsk
 * are listed; words valid in both written languages (også, mange, når, nå) are not. `fra` is
 * left out: approved nn texts name the file tools/runde1_fra_excel.py, which tokenizes to it.
 */
export const NN_STOPLIST: readonly string[] = [
  'ikke',
  'hva',
  'hvem',
  'hvordan',
  'noen',
  'jeg',
  'hun',
  'bare',
  'ble',
  // Added for the eval of survey drafts (0.14): common bokmål forms in survey questions.
  'hvor',
  'hvorfor',
  'hvilken',
  'hvilke',
  'hvilket',
  'hver',
  'hvert',
  'hvis',
  'noe',
  'mye',
  'mer',
  'selv',
  'uten',
  'dere',
  'deres',
  'disse',
  'hjem',
  'hjemme',
  'være',
  'vet',
  'gjør',
  'sier',
  'tror',
  'mener',
  'kommer',
  'bruker',
  'brukere',
  'jobber',
  'svarer',
  'sikkerhet',
];

const WORD = /[\p{L}\p{N}]+/gu;

/** Returns stop-list words found in `text`, matched on word boundaries, case-insensitive. */
export function findBokmal(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(WORD)) {
    const word = match[0].toLowerCase();
    if (NN_STOPLIST.includes(word) && !found.includes(word)) found.push(word);
  }
  return found;
}
