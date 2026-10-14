import { z } from 'zod';

export const Submission = z.strictObject({
  submission_id: z.uuid(),
  part: z.enum(['common', 'leader']),
  lang: z.enum(['nn', 'en', 'nb']),
  answers: z.record(z.string(), z.unknown()),
  free: z.record(z.string(), z.string()).optional(),
  role: z.string().min(1).max(100).optional(),
  duration_s: z.number().int().min(0).max(86400).optional(),
});
export type Submission = z.infer<typeof Submission>;
