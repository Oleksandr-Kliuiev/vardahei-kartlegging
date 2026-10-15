// varde/config/model.json — the model Oleksandr chose after a pass (written by
// `eval:score -- --select <model>`): {model, effort, prompt_hash, briefs_version, report}.
// It is valid only while a pass report with the same triple exists and the prompt and briefs
// still hash to it (ADR-018; preparation of the CI check 2.13).
import { z } from 'zod';
import { EFFORTS } from './config.js';

const Hash = z.string().regex(/^[0-9a-f]{64}$/);

export const ModelConfig = z.strictObject({
  model: z.string(),
  effort: z.enum(EFFORTS),
  prompt_hash: Hash,
  briefs_version: Hash,
  /** Repository-relative path of the eval report. */
  report: z.string(),
});
export type ModelConfig = z.infer<typeof ModelConfig>;

const Summary = z.object({
  prompt_hash: z.string(),
  briefs_version: z.string(),
  results: z.array(z.object({ model: z.string(), effort: z.string(), pass: z.boolean() })),
  selected: z.string().nullable(),
});

/** The machine-readable summary: the last ```json block of the report. */
export function reportSummary(report: string): z.infer<typeof Summary> {
  const blocks = [...report.matchAll(/```json\n([\s\S]*?)\n```/g)];
  const last = blocks.at(-1)?.[1];
  if (last === undefined) throw new Error('report has no ```json summary block');
  return Summary.parse(JSON.parse(last));
}

/** Problems of model.json against its report and the current hashes; empty when valid. */
export function verifyModelConfig(
  config: ModelConfig,
  report: string,
  current: { prompt_hash: string; briefs_version: string },
): string[] {
  const problems: string[] = [];
  const summary = reportSummary(report);
  if (summary.prompt_hash !== config.prompt_hash) problems.push('report has another prompt_hash');
  if (summary.briefs_version !== config.briefs_version)
    problems.push('report has another briefs_version');
  const result = summary.results.find((r) => r.model === config.model);
  if (!result?.pass) problems.push(`report has no pass for ${config.model}`);
  if (result && result.effort !== config.effort) problems.push('report has another effort');
  if (summary.selected !== config.model)
    problems.push(`report does not record the choice of ${config.model}`);
  if (current.prompt_hash !== config.prompt_hash)
    problems.push('prompt changed since the eval: run the live eval again (ADR-018)');
  if (current.briefs_version !== config.briefs_version)
    problems.push('briefs changed since the eval: run the live eval again (ADR-018)');
  return problems;
}
