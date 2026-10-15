// tools/eval/models.json: models under evaluation, effort, runs per brief, threshold profile.
// Simplified 0.14 (decision of Oleksandr 13.10): one model, one run, profile `simplified`.
// The full version adds claude-sonnet-5-5, sets runs_per_brief to 2 and the profile to `full`.
import { readFileSync } from 'node:fs';
import { z } from 'zod';

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];

/** USD per million tokens, from the Anthropic pricing page (date in prices_checked). */
const Prices = z.strictObject({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cache_write_5m: z.number().nonnegative(),
  cache_read: z.number().nonnegative(),
});
export type Prices = z.infer<typeof Prices>;

const ModelEntry = z.strictObject({
  /** Exact model id without a date suffix (ADR-010). */
  id: z.string().regex(/^claude-[a-z]+-\d+(-\d+)?$/),
  effort: z.enum(EFFORTS),
  max_tokens: z.number().int().positive(),
  price_usd_per_mtok: Prices,
});
export type ModelEntry = z.infer<typeof ModelEntry>;

export const EvalConfig = z.strictObject({
  thresholds: z.enum(['simplified', 'full']),
  runs_per_brief: z.number().int().min(1),
  prices_checked: z.string(),
  models: z.array(ModelEntry).min(1),
});
export type EvalConfig = z.infer<typeof EvalConfig>;

export function loadConfig(file: string): EvalConfig {
  const config = EvalConfig.parse(JSON.parse(readFileSync(file, 'utf8')));
  const ids = config.models.map((m) => m.id);
  if (new Set(ids).size !== ids.length) throw new Error(`${file}: duplicate model id`);
  return config;
}
