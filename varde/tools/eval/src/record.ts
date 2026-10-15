// A recorded run (task 0.14): only the model's answer and metadata (model, effort, stop_reason,
// usage, cost, time) — never request headers or keys. Records are committed as eval fixtures
// under runs/<briefs_version:12>/<prompt_hash:12>/<model>/<brief>-<run>.json.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { checkDraft, SurveyDraft } from '@varde/schema/survey-draft';
import { z } from 'zod';
import { EFFORTS, type ModelEntry, type Prices } from './config.js';
import { sha256, short } from './hash.js';

export const RECORD_FORMAT = 'varde-eval-run/1';

/** Critical error codes of ADR-010 (scoring sheet column `critical_errors`). */
export const CRITICAL_CODES = [
  'wrong_language',
  'mixed_nn_nb',
  'invented_fact',
  'product_name',
  'schema_violation',
  'refusal',
] as const;
export const CriticalCode = z.enum(CRITICAL_CODES);
export type CriticalCode = z.infer<typeof CriticalCode>;

const Hash = z.string().regex(/^[0-9a-f]{64}$/);
const Finding = z.strictObject({ where: z.string(), found: z.array(z.string()) });

export const Checks = z.strictObject({
  /** JSON, schema and structural problems; non-empty means schema_violation. */
  schema: z.array(z.string()),
  bokmal: z.array(Finding),
  products: z.array(Finding),
  long_questions: z.array(z.string()),
  missing_dont_know: z.array(z.string()),
});
export type Checks = z.infer<typeof Checks>;

const Usage = z.strictObject({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  cache_creation_input_tokens: z.number().int().nonnegative(),
  cache_read_input_tokens: z.number().int().nonnegative(),
  thinking_tokens: z.number().int().nonnegative().nullable(),
  /** Where inference ran (`global` routing or `us`), as reported by the API (0.13). */
  inference_geo: z.string().nullable(),
  service_tier: z.string().nullable(),
});
export type RecordUsage = z.infer<typeof Usage>;

export const Triple = z.strictObject({
  prompt_hash: Hash,
  model: z.string(),
  briefs_version: Hash,
});
export type Triple = z.infer<typeof Triple>;

/** Strict: a record with any other key (headers, request ids) does not load. */
export const RunRecord = z.strictObject({
  format: z.literal(RECORD_FORMAT),
  triple: Triple,
  schema_hash: Hash,
  brief: z.string(),
  run: z.number().int().min(1),
  request: z.strictObject({
    model: z.string(),
    effort: z.enum(EFFORTS),
    max_tokens: z.number().int().positive(),
    thinking: z.literal('adaptive'),
  }),
  response: z.strictObject({
    model: z.string(),
    stop_reason: z.string().nullable(),
    stop_details: z
      .strictObject({ category: z.string().nullable(), explanation: z.string().nullable() })
      .nullable(),
    usage: Usage,
    text: z.string(),
  }),
  output_sha: z.string().regex(/^[0-9a-f]{12}$/),
  cost_usd: z.number().nonnegative(),
  started_at: z.string(),
  duration_ms: z.number().nonnegative(),
  checks: Checks,
  auto_critical: z.array(CriticalCode),
});
export type RunRecord = z.infer<typeof RunRecord>;

/**
 * Variant label of a run in a scoring sheet: `<model>#<run>`. The simplified 0.14 uses it as is
 * (no blinding, decision 13.10); blind.ts of the full version maps letters A–D to these labels.
 */
export const variantLabel = (model: string, run: number): string => `${model}#${run}`;

export function parseVariant(label: string): { model: string; run: number } | null {
  const m = /^(.+)#(\d+)$/.exec(label);
  return m ? { model: m[1]!, run: Number(m[2]) } : null;
}

const noChecks = (schema: string[]): Checks => ({
  schema,
  bokmal: [],
  products: [],
  long_questions: [],
  missing_dont_know: [],
});

/**
 * Automatic checks of an answer. Critical codes found automatically: `refusal`,
 * `schema_violation`, `mixed_nn_nb` (stop-list hit), `product_name`. Long questions and
 * missing «veit ikkje» are warnings for the rater, not critical errors (ADR-010).
 */
export function evaluate(
  text: string,
  stopReason: string | null,
): { checks: Checks; auto_critical: CriticalCode[]; draft: SurveyDraft | null } {
  if (stopReason === 'refusal')
    return { checks: noChecks([]), auto_critical: ['refusal'], draft: null };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    const issue = `answer is not JSON (stop_reason ${stopReason ?? 'null'})`;
    return { checks: noChecks([issue]), auto_critical: ['schema_violation'], draft: null };
  }
  const parsed = SurveyDraft.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    return { checks: noChecks(issues), auto_critical: ['schema_violation'], draft: null };
  }
  const check = checkDraft(parsed.data);
  const auto: CriticalCode[] = [];
  if (check.issues.length > 0) auto.push('schema_violation');
  if (check.bokmal.length > 0) auto.push('mixed_nn_nb');
  if (check.products.length > 0) auto.push('product_name');
  const { issues, ...rest } = check;
  return { checks: { schema: issues, ...rest }, auto_critical: auto, draft: parsed.data };
}

/** Estimated cost in USD at standard prices (no US-only inference surcharge). */
export function costUsd(usage: RecordUsage, prices: Prices): number {
  const micro =
    usage.input_tokens * prices.input +
    usage.output_tokens * prices.output +
    usage.cache_creation_input_tokens * prices.cache_write_5m +
    usage.cache_read_input_tokens * prices.cache_read;
  return Math.round(micro) / 1e6;
}

export interface RecordContext {
  triple: Triple;
  schemaHash: string;
  brief: string;
  run: number;
  model: ModelEntry;
  startedAt: Date;
  durationMs: number;
}

/** Builds a record field by field from the final message; nothing else of the response is kept. */
export function buildRecord(message: Anthropic.Message, ctx: RecordContext): RunRecord {
  const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  const u = message.usage;
  const usage: RecordUsage = {
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    thinking_tokens: u.output_tokens_details?.thinking_tokens ?? null,
    inference_geo: u.inference_geo ?? null,
    service_tier: u.service_tier ?? null,
  };
  const details = message.stop_details;
  const { checks, auto_critical } = evaluate(text, message.stop_reason);
  return {
    format: RECORD_FORMAT,
    triple: ctx.triple,
    schema_hash: ctx.schemaHash,
    brief: ctx.brief,
    run: ctx.run,
    request: {
      model: ctx.model.id,
      effort: ctx.model.effort,
      max_tokens: ctx.model.max_tokens,
      thinking: 'adaptive',
    },
    response: {
      model: message.model,
      stop_reason: message.stop_reason,
      stop_details: details
        ? { category: details.category, explanation: details.explanation }
        : null,
      usage,
      text,
    },
    output_sha: short(sha256(text)),
    cost_usd: costUsd(usage, ctx.model.price_usd_per_mtok),
    started_at: ctx.startedAt.toISOString(),
    duration_ms: Math.round(ctx.durationMs),
    checks,
    auto_critical,
  };
}

/** API keys and request headers must never be recorded (case-insensitive). */
export const SECRET_PATTERN = /x-api-key|authorization|sk-ant-/i;

export function serializeRecord(record: RunRecord): string {
  const json = `${JSON.stringify(record, null, 2)}\n`;
  if (SECRET_PATTERN.test(json))
    throw new Error(`record ${record.brief}-${record.run}: key or header pattern`);
  return json;
}

export function tripleDir(runsDir: string, triple: Omit<Triple, 'model'>): string {
  return join(runsDir, short(triple.briefs_version), short(triple.prompt_hash));
}

export function recordPath(runsDir: string, triple: Triple, brief: string, run: number): string {
  return join(tripleDir(runsDir, triple), triple.model, `${brief}-${run}.json`);
}

export function readRecord(file: string): RunRecord {
  return RunRecord.parse(JSON.parse(readFileSync(file, 'utf8')));
}

/** Every file under `dir`, recursively (absolute paths, sorted). */
export function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name))
    .sort();
}
