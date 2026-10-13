// Retention by data class (0.19, ADR-017): varde/config/retention.json and its schema. The jobs
// that apply it are 1.31; this file only loads and validates. Responses have no timer: any
// `ttl_*` on `response` is rejected; the backup window must add up (35 + 93 = 128).
import { z } from 'zod';
import { readConfigJson } from '../../config/config-dir.js';

const days = z.number().int().positive();

const Backup = z
  .strictObject({
    rotation_days: days,
    recycle_bin_days: days,
    effective_max_days: days,
  })
  .refine((b) => b.effective_max_days === b.rotation_days + b.recycle_bin_days, {
    message: 'backup.effective_max_days must equal rotation_days + recycle_bin_days',
  });

/** Responses: deletion only on an explicit request, never by a timer. */
const Response = z.looseObject({ kind: z.literal('on_request') }).superRefine((r, ctx) => {
  for (const key of Object.keys(r)) {
    if (key.startsWith('ttl_')) {
      ctx.addIssue({ code: 'custom', message: `response has no timer (${key})`, path: [key] });
    } else if (key !== 'kind') {
      ctx.addIssue({ code: 'custom', message: `unknown key ${key}`, path: [key] });
    }
  }
});

export const RetentionClasses = z.strictObject({
  progress_event: z.strictObject({ ttl_hours: z.literal(24) }),
  response: Response,
  aggregate_snapshot_released: z.strictObject({
    min_years: z.number().int().min(3),
    review: z.literal('yearly'),
  }),
  /** Findings live as long as the released snapshots they are computed from. */
  finding: z.strictObject({ min_years: z.number().int().min(3), review: z.literal('yearly') }),
  contact: z.strictObject({ kind: z.literal('relationship') }),
  registration: z.strictObject({ after_seminar_days: days }),
  proposal: z.strictObject({ ttl_months: days }),
  audit_log: z.strictObject({ ttl_months: days }),
  deletion_ledger: z.strictObject({
    kind: z.literal('forever'),
    export: z.literal('after_each_write'),
  }),
  app_logs: z.strictObject({ kind: z.literal('size_bounded'), max_mb: days }),
  admin_session: z.strictObject({ after_expiry_days: days }),
  connection_log: z.strictObject({ ttl_months: days }),
  pgboss_jobs: z.strictObject({ ttl_days: days }),
  // Service tables of stage 1 (1.4c): templates, rounds and clients, metric/rule definitions.
  template_version: z.strictObject({ kind: z.literal('forever') }),
  round: z.strictObject({ kind: z.literal('forever') }),
  metric_definition: z.strictObject({ kind: z.literal('forever') }),
  /** Counts and rejected line numbers only — never answers or initials (ADR-024). */
  import_manifest: z.strictObject({
    kind: z.literal('forever'),
    content: z.literal('counts_only'),
  }),
  backup: Backup,
});

export const ExternalCopy = z.strictObject({
  name: z.string().regex(/^[a-z0-9-]+$/),
  owner: z.string().min(1),
  procedure: z.string().min(1),
});

export const RetentionConfig = z.strictObject({
  classes: RetentionClasses,
  external_copies: z.array(ExternalCopy).min(1),
});
export type RetentionConfig = z.infer<typeof RetentionConfig>;

export function readRetentionConfig(env: NodeJS.ProcessEnv = process.env): RetentionConfig {
  return RetentionConfig.parse(readConfigJson('retention.json', env));
}
