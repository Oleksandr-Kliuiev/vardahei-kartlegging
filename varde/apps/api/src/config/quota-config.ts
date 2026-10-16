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
});
export type QuotaConfig = z.infer<typeof QuotaConfig>;
export function readQuotaConfig(): QuotaConfig {
  return QuotaConfig.parse(readConfigJson('quotas.json'));
}
