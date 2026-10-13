// Reads the metric fixtures of 0.16 (packages/schema/fixtures/metrics).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const METRICS_DIR = fileURLToPath(new URL('../../fixtures/metrics', import.meta.url));

export function metricFixtures(): string[] {
  return readdirSync(METRICS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

export function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(METRICS_DIR, name), 'utf8'));
}
