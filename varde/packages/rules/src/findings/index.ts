/**
 * Entry point `@varde/rules/findings`: metrics and finding rules.
 * Must not import `@varde/rules/runner` internals.
 */

/** Stable key of a metric definition version, e.g. `zone@3`. */
export function metricKey(key: string, version: number): string {
  if (!/^[a-z][a-z0-9_.]*$/.test(key)) throw new Error(`invalid metric key: ${key}`);
  if (!Number.isInteger(version) || version < 1)
    throw new Error(`invalid metric version: ${version}`);
  return `${key}@${version}`;
}
