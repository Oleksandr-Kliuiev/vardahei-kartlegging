import { z } from 'zod';
import { readConfigJson } from './config-dir.js';

export const QuotaConfig = z
  .strictObject({
    round_client_factor: z.number().int().positive(),
    round_client_min: z.number().int().positive(),
    global_per_10min: z.number().int().positive(),
    /** A window of its own per round client (1.4): one leaked link cannot fill the window of all. */
    per_round_client_per_10min: z.number().int().positive(),
    per_ip_per_10min: z.number().int().positive(),
    /** Seminar registration (3.2): registrations per seminar, and windows of 10 minutes. */
    seminar_registrations_max: z.number().int().positive(),
    seminar_global_per_10min: z.number().int().positive(),
    seminar_per_seminar_per_10min: z.number().int().positive(),
    seminar_per_ip_per_10min: z.number().int().positive(),
    /** Seminar live poll (3.4, ADR-009 «по числу вопросов × участников»): answers per question at
     * most, and windows of 10 minutes for a hall behind one NAT (3.7). */
    live_participants_max: z.number().int().positive(),
    live_global_per_10min: z.number().int().positive(),
    live_per_round_client_per_10min: z.number().int().positive(),
    live_per_ip_per_10min: z.number().int().positive(),
  })
  // A window of one link must stay below the window of all, or it protects nothing.
  .refine(
    (c) =>
      c.per_round_client_per_10min <= c.global_per_10min &&
      c.seminar_per_seminar_per_10min <= c.seminar_global_per_10min &&
      c.live_per_round_client_per_10min <= c.live_global_per_10min,
    'a window per link must not be larger than the global window',
  );
export type QuotaConfig = z.infer<typeof QuotaConfig>;
export function readQuotaConfig(): QuotaConfig {
  return QuotaConfig.parse(readConfigJson('quotas.json'));
}
