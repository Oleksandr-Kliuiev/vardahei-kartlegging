// Input of the seminar admin (3.1) and the one e-mail rule shared by registration and deletion.
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/** One line of text without control characters (they would break the calendar file); a
 * multi-line text may keep its line breaks. */
const text = (max: number, multiline = false) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((s) => !(multiline ? /[^\P{Cc}\n]/u : /\p{Cc}/u).test(s), {
      message: 'Teksten har teikn som ikkje kan brukast. Skriv han på nytt.',
    });
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Trimmed and lower case: one contact per address (CHECK contact_email_check). */
export const Email = z
  .string()
  .trim()
  .max(254)
  .transform((s) => s.toLowerCase())
  .pipe(z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/));

export const SeminarInput = z
  .strictObject({
    topic_nn: text(160).pipe(z.string().min(1)),
    topic_en: text(160).optional(),
    /** Wall-clock day and times in Europe/Oslo. */
    date: z.iso.date(),
    start: clock,
    end: clock,
    place: text(200).pipe(z.string().min(1)),
    format: z.enum(['onsite', 'digital']),
    languages: z.array(z.enum(['nn', 'en'])).max(2).default(['nn']),
    clients: z.array(z.uuid()).max(30).default([]),
  })
  .transform((s) => ({
    ...s,
    topic_en: s.topic_en ? s.topic_en : null,
    languages: (['nn', 'en'] as const).filter((l) => l === 'nn' || s.languages.includes(l)),
    clients: [...new Set(s.clients)],
  }))
  .refine((s) => s.end > s.start, { message: 'Seminaret må slutte etter at det byrjar.' })
  .refine((s) => !s.languages.includes('en') || s.topic_en !== null, {
    message: 'Skriv temaet på engelsk òg, eller ta bort engelsk.',
  });
export type SeminarInput = z.infer<typeof SeminarInput>;

export const FindingStatusInput = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('open') }),
  z.strictObject({ status: z.literal('in_seminar'), seminar: z.uuid() }),
  z.strictObject({ status: z.literal('closed'), seminar: z.uuid().optional() }),
]);
export type FindingStatusInput = z.infer<typeof FindingStatusInput>;

export const ActionInput = z.strictObject({
  name: text(120).pipe(z.string().min(1)),
  description: text(2000, true).pipe(z.string().min(1)),
  seminar_topic: text(160).pipe(z.string().min(1)),
});

/** Parse admin input; a rule of the schema with its own message says what is wrong. */
export function parseWith<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const own = result.error.issues.find((i) => i.code === 'custom' && i.message);
  throw new BadRequestException(own?.message ?? 'Kontroller opplysningane.');
}
