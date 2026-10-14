import { z } from 'zod';

export const FindingRule = z.strictObject({
  key: z.string().min(1),
  version: z.number().int().positive(),
  channel: z.enum(['aggregate', 'leader']),
  metric_key: z.string().min(1),
  question: z.string().optional(),
  options: z.array(z.string()),
  raw_options: z.array(z.string()).optional(),
  basis: z.string().min(1),
  threshold: z.strictObject({ medium: z.number().min(0), high: z.number().min(0) }),
  min_count: z.number().int().positive(),
  text: z.strictObject({ nn: z.string().min(1), en: z.string().min(1) }),
  action_text: z.strictObject({ nn: z.string().min(1), en: z.string().min(1) }),
  severity: z.enum(['risk', 'opportunity']),
  level: z.enum(['medium', 'high']).optional(),
  computed: z.enum(['routine', 'heaviest', 'f12_b13']).optional(),
  minimum_hours: z.number().optional(),
  order: z.number().int(),
});
export type FindingRule = z.infer<typeof FindingRule>;
export interface FindingView {
  key: string;
  version: number;
  channel: 'aggregate' | 'leader';
  n: number;
  count: number;
  share: number;
  level: 'medium' | 'high';
  text: string;
  action: string;
  severity: 'risk' | 'opportunity';
  tal: string;
  release_id?: string;
  order: number;
}
