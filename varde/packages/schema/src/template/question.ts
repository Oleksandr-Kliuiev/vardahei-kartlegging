// Question of a template version (ADR-005, delta 12.10): a discriminated union by `type`.
// Structural dependencies and scores are explicit fields, not expressions (ADR-026).
import { z } from 'zod';
import { Expression } from './expression.js';
import { LocalizedText } from './texts.js';

export const QUESTION_ID = /^[A-Za-z][A-Za-z0-9_]*$/;
const Id = z.string().regex(QUESTION_ID);
const OptionId = z.string().regex(/^[A-Za-z0-9_-]+$/);

export const Part = z.enum(['common', 'leader']);
export type Part = z.infer<typeof Part>;

export const QuestionTexts = z.strictObject({
  text: LocalizedText,
  help: LocalizedText.optional(),
  section_title: LocalizedText.optional(),
  placeholder: LocalizedText.optional(),
  short_label: LocalizedText.optional(),
});

export const Score = z.number().int().min(0).max(3);

export const Option = z.strictObject({
  id: OptionId,
  texts: z.strictObject({ text: LocalizedText }),
  score: Score.optional(),
  visible_if: Expression.optional(),
});
export type Option = z.infer<typeof Option>;

export const FreeText = z.strictObject({
  texts: z.strictObject({ text: LocalizedText }),
  /** Shown only when one of these options is chosen; always shown when absent. */
  when: z.array(OptionId).min(1).optional(),
});

export const Scenario = z.strictObject({
  correct_options: z.array(OptionId).min(1),
  explanation: z.strictObject({ title: LocalizedText, text: LocalizedText }),
});

const common = {
  id: Id,
  part: Part,
  texts: QuestionTexts,
  visible_if: Expression.optional(),
  optional: z.literal(true).optional(),
  required: z.literal(true).optional(),
  role: z.literal(true).optional(),
  anchor_key: z.string().min(1).optional(),
  frozen: z.literal(true).optional(),
  identifier: z.literal(true).optional(),
};

const choice = {
  ...common,
  options: z.array(Option).min(1),
  choices_from: Id.optional(),
  exclusive_options: z.array(OptionId).min(1).optional(),
  free_text: FreeText.optional(),
  scenario: Scenario.optional(),
};

export const SingleQuestion = z.strictObject({ ...choice, type: z.literal('single') });
export const MultiQuestion = z.strictObject({
  ...choice,
  type: z.literal('multi'),
  max_choices: z.number().int().min(1).optional(),
  min_choices: z.number().int().min(1).optional(),
});
export const TextQuestion = z.strictObject({
  ...common,
  type: z.literal('text'),
  single_line: z.literal(true).optional(),
  uppercase: z.literal(true).optional(),
  max_length: z.number().int().min(1).optional(),
  min_length: z.number().int().min(1).optional(),
});

export const ScaleBounds = z.strictObject({
  min: z.number().int(),
  max: z.number().int(),
  low: LocalizedText,
  high: LocalizedText,
});
export const Row = z.strictObject({ id: OptionId, texts: z.strictObject({ text: LocalizedText }) });

export const ScaleQuestion = z.strictObject({
  ...common,
  type: z.literal('scale'),
  rows: z.array(Row).min(1),
  scale: ScaleBounds,
  free_text: FreeText.optional(),
});
export const NpsQuestion = z.strictObject({
  ...common,
  type: z.literal('nps'),
  scale: ScaleBounds.extend({ min: z.literal(0), max: z.literal(10) }),
  free_text: FreeText.optional(),
});

export const Question = z.discriminatedUnion('type', [
  SingleQuestion,
  MultiQuestion,
  TextQuestion,
  ScaleQuestion,
  NpsQuestion,
]);
export type Question = z.infer<typeof Question>;
export type ChoiceQuestion = z.infer<typeof SingleQuestion> | z.infer<typeof MultiQuestion>;
export type QuestionType = Question['type'];

export function isChoice(q: Question): q is ChoiceQuestion {
  return q.type === 'single' || q.type === 'multi';
}
