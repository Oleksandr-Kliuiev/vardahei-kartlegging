/**
 * Bokmål word forms that must not appear in nynorsk text.
 * Shared by the text checks (0.18) and the eval (0.14).
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
