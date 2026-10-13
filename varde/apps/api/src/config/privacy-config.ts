// Privacy threshold k (ADR-021): varde/config/privacy.json, the one place for the number.
import { readConfigJson } from './config-dir.js';

export interface PrivacyConfig {
  /** A group is shown only when n ≥ k. */
  k: number;
}

export function readPrivacyConfig(env: NodeJS.ProcessEnv = process.env): PrivacyConfig {
  const raw = readConfigJson('privacy.json', env) as Partial<PrivacyConfig>;
  if (typeof raw.k !== 'number' || !Number.isInteger(raw.k) || raw.k < 2) {
    throw new Error('privacy.json: k must be an integer ≥ 2');
  }
  return { k: raw.k };
}
