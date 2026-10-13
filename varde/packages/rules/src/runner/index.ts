/**
 * Entry point `@varde/rules/runner`: visibility, option dependencies, normalisation.
 * Must stay free of server code and of `@varde/rules/findings`.
 */

/** Treats empty strings, whitespace-only strings and empty arrays as "no answer". */
export function normalizeEmpty<T>(value: T | '' | readonly unknown[] | null | undefined): T | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (Array.isArray(value) && value.length === 0) return null;
  return value as T;
}
