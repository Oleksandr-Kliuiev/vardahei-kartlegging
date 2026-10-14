/**
 * Entry point `@varde/rules/findings`: metrics and finding rules (1.10).
 * Must not import `@varde/rules/runner` internals. Re-exports by name only.
 */
export {
  answerOf,
  criticalShare,
  cross,
  distribution,
  heaviestTask,
  isAnswered,
  meanScore,
  type MetricRow,
  personLevel,
  personScore,
  personsPerZone,
  routineHoursWeek,
  type Scoring,
  scoresOf,
  scoreStat,
  valuesOf,
  zone,
} from './calc.js';
export { cells, groupsOf, type MetricCell, metricValues, subMetrics } from './cells.js';

/** Stable key of a metric definition version, e.g. `zone@3`. */
export function metricKey(key: string, version: number): string {
  if (!/^[a-z][a-z0-9_.]*$/.test(key)) throw new Error(`invalid metric key: ${key}`);
  if (!Number.isInteger(version) || version < 1)
    throw new Error(`invalid metric version: ${version}`);
  return `${key}@${version}`;
}
