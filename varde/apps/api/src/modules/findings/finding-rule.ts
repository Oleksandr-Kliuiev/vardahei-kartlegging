import { z } from 'zod';

const Texts = z.strictObject({ nn: z.string().min(1), en: z.string().min(1) });
/** Fields of one rule version (1.28, ADR-026); the invariants below hold for seeds and editor versions. */
export const FindingRuleFields = z.strictObject({
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
  text: Texts,
  action_text: Texts,
  severity: z.enum(['risk', 'opportunity']),
  level: z.enum(['medium', 'high']).optional(),
  computed: z.enum(['routine', 'heaviest', 'f12_b13']).optional(),
  minimum_hours: z.number().min(0).optional(),
  order: z.number().int(),
});
type Fields = Omit<z.infer<typeof FindingRuleFields>, 'version'>;

/** What a rule measures: a new version may change texts, thresholds and options, never these (2.5). */
export const IDENTITY_FIELDS = [
  'key',
  'channel',
  'metric_key',
  'basis',
  'computed',
  'question',
  'raw_options',
] as const;
/** Placeholders that evaluate.ts fills in the texts of computed rules. */
export const PLACEHOLDERS: Record<string, readonly string[]> = {
  routine: ['n'],
  heaviest: ['task', 'n', 'persons'],
};

function invariants(r: Fields, ctx: z.RefinementCtx) {
  const { medium, high } = r.threshold;
  if (!(medium <= high && high <= 1))
    ctx.addIssue({
      code: 'custom',
      path: ['threshold'],
      message: 'threshold: 0 ≤ medium ≤ high ≤ 1',
    });
  if (new Set(r.options).size !== r.options.length)
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'options: duplicate' });
  // evaluate.ts fills placeholders in the finding text only; the action text is shown as it is.
  for (const field of ['text', 'action_text'] as const)
    for (const lang of ['nn', 'en'] as const) {
      const value = r[field][lang];
      if (!value.trim())
        ctx.addIssue({ code: 'custom', path: [field, lang], message: 'text: empty' });
      const allowed = field === 'text' ? (PLACEHOLDERS[r.computed ?? ''] ?? []) : [];
      for (const m of value.matchAll(/\{([^}]*)\}/g))
        if (!allowed.includes(m[1] ?? ''))
          ctx.addIssue({
            code: 'custom',
            path: [field, lang],
            message: `text: unknown placeholder {${m[1] ?? ''}}`,
          });
    }
}

export const FindingRule = FindingRuleFields.superRefine(invariants);
export type FindingRule = z.infer<typeof FindingRuleFields>;
/** A rule from the editor: the server assigns the version (max + 1). */
export const RuleDraft = FindingRuleFields.omit({ version: true }).superRefine(invariants);
export type RuleDraft = z.infer<typeof RuleDraft>;
export type Channel = FindingRule['channel'];

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
