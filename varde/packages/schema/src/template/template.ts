// TemplateContent: the content of one TemplateVersion (ADR-005, ADR-019, ADR-025, ADR-026).
// Consistency across questions is checked by `validate.ts`; use `TemplateVersionContent` there.
import { z } from 'zod';
import { Expression } from './expression.js';
import { Question } from './question.js';
import { Lang, LocalizedText } from './texts.js';

export const Audience = z.enum(['client_survey', 'seminar_live', 'seminar_after']);
export type Audience = z.infer<typeof Audience>;
export const Identification = z.enum(['initials', 'none']);
export type Identification = z.infer<typeof Identification>;

export const SCORE_LEVELS = ['gron', 'gul', 'oransje', 'raud'] as const;
const Level = (id: (typeof SCORE_LEVELS)[number]) =>
  z.strictObject({ id: z.literal(id), label: LocalizedText });

export const ScoreScale = z.strictObject({
  key: z.literal('risk-0-3'),
  levels: z.tuple([Level('gron'), Level('gul'), Level('oransje'), Level('raud')]),
});

export const Contact = z.strictObject({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().min(1),
  hours: LocalizedText,
});

export const Intro = z.strictObject({
  title: LocalizedText,
  short: LocalizedText,
  minutes: z.number().int().min(1),
  letter: z.array(LocalizedText),
  sender: LocalizedText,
  facts: z.array(LocalizedText),
  contact: Contact,
});

export const Tip = z.strictObject({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  when: Expression,
  title: LocalizedText,
  text: LocalizedText,
  closing: z.literal(true).optional(),
  reserve: z.literal(true).optional(),
});
export type Tip = z.infer<typeof Tip>;

export const TemplateContentShape = z.strictObject({
  key: z.string().regex(/^[a-z0-9_-]+$/),
  audience: Audience,
  identification: Identification.default('initials'),
  required_languages: z.array(Lang).min(1),
  score_scale: ScoreScale.optional(),
  leader_roles: z.array(z.string().min(1)),
  intro: Intro,
  leader_intro: z.strictObject({ title: LocalizedText, text: LocalizedText }),
  tips: z.array(Tip),
  max_tips: z.number().int().min(0),
  /** Texts of "Send ut" and the poster (filled by 1.21). */
  invitation: z.record(z.string(), LocalizedText).optional(),
  questions: z.array(Question).min(1),
});
export type TemplateContent = z.infer<typeof TemplateContentShape>;
