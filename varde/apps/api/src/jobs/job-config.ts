// Registry of pg-boss job types (task 0.9, ADR-003). Limits come from config/jobs.json
// (defaults + per-type overrides); only the idempotency key lives in code.
import { z } from 'zod';
import { readConfigJson } from '../config/config-dir.js';

/** Job payload: references only (an id and an optional content hash), never data. */
export const JobPayloadSchema = z
  .object({
    id: z.uuid(),
    hash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export type JobPayload = z.infer<typeof JobPayloadSchema>;

export interface JobType {
  name: string;
  concurrency: number;
  timeoutSeconds: number;
  retryLimit: number;
  retryBackoff: 'exponential';
  retryDelaySeconds: number;
  /** pg-boss 10: stately = one queued + one active per key; singleton = never two active. */
  policy: 'stately' | 'singleton';
  pollingIntervalSeconds: number;
  idempotency: (payload: JobPayload) => string;
  settings: Record<string, unknown>;
}

const Limits = z
  .object({
    concurrency: z.number().int().min(1),
    timeoutSeconds: z.number().int().min(1),
    retryLimit: z.number().int().min(0),
    retryBackoff: z.literal('exponential'),
    retryDelaySeconds: z.number().int().min(1),
    policy: z.enum(['stately', 'singleton']),
    pollingIntervalSeconds: z.number().min(0.5),
  })
  .strict();

const JobsFile = z
  .object({
    defaults: Limits,
    types: z.record(
      z.string(),
      Limits.partial()
        .extend({ settings: z.record(z.string(), z.unknown()).optional() })
        .strict(),
    ),
  })
  .strict();

export type Idempotency = Record<string, (payload: JobPayload) => string>;

/** Job types of stage 0 (code side of the registry). */
export const STAGE0_JOBS: Idempotency = {
  'demo.sleep': (p) => `demo.sleep:${p.id}`,
};
export const APPLICATION_JOBS: Idempotency = {
  ...STAGE0_JOBS,
  'retention.run': (p) => `retention.run:${p.id}`,
  'retention.progress-ttl': (p) => `retention.progress-ttl:${p.id}`,
};

/** Merges config/jobs.json with the code registry; both must name the same types. */
export function loadJobTypes(
  env: NodeJS.ProcessEnv = process.env,
  registry: Idempotency = APPLICATION_JOBS,
): JobType[] {
  const file = JobsFile.parse(readConfigJson('jobs.json', env));
  const configured = Object.keys(file.types).sort();
  const coded = Object.keys(registry).sort();
  if (configured.join() !== coded.join()) {
    throw new Error(`jobs.json types [${configured.join()}] != registry [${coded.join()}]`);
  }
  return configured.map((name) => {
    const { settings, ...overrides } = file.types[name] ?? {};
    const idempotency = registry[name];
    if (idempotency === undefined) throw new Error(`no idempotency for ${name}`);
    return {
      ...file.defaults,
      ...overrides,
      name,
      idempotency,
      settings: settings ?? {},
    } as JobType;
  });
}
