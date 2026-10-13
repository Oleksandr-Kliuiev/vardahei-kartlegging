// Privacy threshold k (ADR-021): varde/config/privacy.json, the one place for the number.
import { readConfigJson } from './config-dir.js';

export interface PrivacyConfig {
  /** A group is shown only when n ≥ k. */
  k: number;
  /** Counts released exactly, the named exception of ADR-021 rule 6 (`responses_total`). */
  exact_counts: readonly string[];
}

export function readPrivacyConfig(env: NodeJS.ProcessEnv = process.env): PrivacyConfig {
  const raw = readConfigJson('privacy.json', env) as Partial<PrivacyConfig>;
  if (typeof raw.k !== 'number' || !Number.isInteger(raw.k) || raw.k < 2) {
    throw new Error('privacy.json: k must be an integer ≥ 2');
  }
  const exact = raw.exact_counts ?? [];
  if (!Array.isArray(exact) || !exact.every((e) => typeof e === 'string')) {
    throw new Error('privacy.json: exact_counts must be a list of metric keys');
  }
  return { k: raw.k, exact_counts: exact };
}
