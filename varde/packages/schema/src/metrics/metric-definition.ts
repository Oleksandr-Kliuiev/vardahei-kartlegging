// MetricDefinition (0.16, ADR-020, ADR-026): a versioned measurement contract. The calculation
// is stage 1 (1.10); the check that keys/parts match a real template is 1.10 as well.
import { z } from 'zod';
import { Part, Population, populationAllows } from './populations.js';

/** The one place where metric kinds are listed (1.10: routine_hours_week, heaviest_task). */
export const METRIC_KINDS = [
  'distribution',
  'mean_score',
  'critical_share',
  'zone',
  'persons_per_zone',
  'cross',
  'routine_hours_week',
  'heaviest_task',
] as const;
export const MetricKind = z.enum(METRIC_KINDS);
export type MetricKind = z.infer<typeof MetricKind>;

/** Kinds that need `thresholds` (persons_per_zone uses `thresholds.person`, ADR-026). */
export const KINDS_WITH_THRESHOLDS: readonly MetricKind[] = ['zone', 'persons_per_zone'];

export const ZONE_LEVELS = ['gron', 'gul', 'oransje', 'raud'] as const;
export const COMPARABILITY_DEGREES = ['comparable', 'approximate', 'incomparable'] as const;
export const Degree = z.enum(COMPARABILITY_DEGREES);

const KEY = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/;
const KEY_AT_VERSION = /^[a-z0-9_]+(\.[a-z0-9_]+)*@[1-9]\d*$/;

export const QuestionRef = z.strictObject({ key: z.string().min(1), part: Part });
export type QuestionRef = z.infer<typeof QuestionRef>;

const increasing = (b: readonly number[]) => b.every((v, i) => i === 0 || v > (b[i - 1] ?? v));
const Bounds = z
  .tuple([z.number(), z.number(), z.number()])
  .refine(increasing, { message: 'bounds must be strictly increasing' });

/** Person level: value ≥ bound; aggregate level: value > bound (docs/sonemodell.md). */
export const Thresholds = z.strictObject({
  person: z.strictObject({ bounds: Bounds, compare: z.literal('>=') }),
  aggregate: z.strictObject({ bounds: Bounds, compare: z.literal('>') }),
  score_scale: z.literal('risk-0-3'),
  levels: z.tuple([z.literal('gron'), z.literal('gul'), z.literal('oransje'), z.literal('raud')]),
});
export type Thresholds = z.infer<typeof Thresholds>;

export const Comparability = z.strictObject({
  to: z.string().regex(KEY_AT_VERSION, 'to must be key@version'),
  degree: Degree,
  note: z.string().min(1),
});

export const MetricDefinition = z
  .strictObject({
    key: z.string().regex(KEY),
    version: z.number().int().positive(),
    kind: MetricKind,
    part: Part,
    questions: z.array(QuestionRef).min(1),
    anchors: z.array(QuestionRef).min(1).optional(),
    /** question key → option key → bucket (distribution, cross) or score (scored kinds). */
    options_mapping: z.record(z.string(), z.record(z.string(), z.union([z.string(), z.number()]))),
    scale: z.string().min(1),
    recall_period: z.string().min(1),
    denominator_rule: z.string().min(1),
    thresholds: Thresholds.optional(),
    populations: z.array(Population).min(1),
    comparability: z.array(Comparability),
    first_version: z.literal(true).optional(),
  })
  .superRefine((m, ctx) => {
    const issue = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: 'custom', message, path });
    if (new Set(m.populations).size !== m.populations.length) {
      issue('populations must be unique', ['populations']);
    }
    m.populations.forEach((p, i) => {
      if (!populationAllows(p, m.part)) {
        issue(`population ${p} does not allow part ${m.part}`, ['populations', i]);
      }
    });
    for (const field of ['questions', 'anchors'] as const) {
      m[field]?.forEach((q, i) => {
        if (q.part !== m.part) issue(`${q.key} is part ${q.part}, metric is ${m.part}`, [field, i]);
      });
    }
    if (m.kind === 'cross') {
      if (m.questions.length !== 2) issue('cross needs exactly two questions', ['questions']);
      if (m.anchors !== undefined && m.anchors.length !== 2) {
        issue('cross needs exactly two anchors', ['anchors']);
      }
    }
    if (KINDS_WITH_THRESHOLDS.includes(m.kind) && m.thresholds === undefined) {
      issue(`${m.kind} needs thresholds`, ['thresholds']);
    }
    if (m.comparability.length === 0 && m.first_version !== true) {
      issue('empty comparability is allowed only with first_version: true', ['comparability']);
    }
  });
export type MetricDefinition = z.infer<typeof MetricDefinition>;

/** A set of definitions (one fixture file). */
export const MetricDefinitionSet = z.array(MetricDefinition).min(1);

/**
 * Explanation for comparing round 1 (Forms) with Varde on the F anchors (ADR-020): referenced
 * from `comparability[].to` of the F-anchor metrics as `<key>@<version>`.
 */
export const ComparabilityNote = z.strictObject({
  key: z.string().regex(KEY),
  version: z.number().int().positive(),
  degree: Degree,
  between: z.tuple([z.string().min(1), z.string().min(1)]),
  anchors: z.array(z.string().min(1)).min(1),
  option_mapping: z.record(z.string(), z.string()),
  not_scored: z.array(z.string().min(1)),
  languages: z.strictObject({
    from: z.array(z.string().min(2)),
    to: z.array(z.string().min(2)),
  }),
  note: z.string().min(1),
});
export type ComparabilityNote = z.infer<typeof ComparabilityNote>;
