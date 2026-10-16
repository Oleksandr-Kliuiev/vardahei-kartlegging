import { z } from 'zod';
import { readConfigJson } from './config-dir.js';

export const QuotaConfig = z.strictObject({
  round_client_factor: z.number().int().positive(),
  round_client_min: z.number().int().positive(),
  global_per_10min: z.number().int().positive(),
  per_ip_per_10min: z.number().int().positive(),
  /** Seminar registration (3.2): registrations per seminar, and windows of 10 minutes. */
  seminar_registrations_max: z.number().int().positive(),
  seminar_global_per_10min: z.number().int().positive(),
  seminar_per_ip_per_10min: z.number().int().positive(),
  /** Seminar live poll (3.4, ADR-009 «по числу вопросов × участников»): answers per question at
   * most, and windows of 10 minutes for a hall behind one NAT (3.7). */
  live_participants_max: z.number().int().positive(),
  live_global_per_10min: z.number().int().positive(),
  live_per_ip_per_10min: z.number().int().positive(),
});
export type QuotaConfig = z.infer<typeof QuotaConfig>;
export function readQuotaConfig(): QuotaConfig {
  return QuotaConfig.parse(readConfigJson('quotas.json'));
}
