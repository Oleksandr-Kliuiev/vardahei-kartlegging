/** Only the version's enabled translations leave the runner API (ADR-019). */
export function languageContent(value: unknown, languages: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => languageContent(item, languages));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) =>
      !['nn', 'en', 'nb'].includes(key) || languages.includes(key),
    ).map(([key, item]: [string, unknown]) => [key, languageContent(item, languages)]));
  }
  return value;
}
