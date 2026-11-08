// Input of «Samtalar» (2.20): rounds of conversations, the start of one conversation and the saving of
// one field. Texts keep their line breaks; other control characters are refused, and so is half of a
// character (a lone surrogate, which Postgres cannot store: it would be a 500, not a 400).
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const text = (max: number, multiline = false) =>
  z
    .string()
    .max(max, { message: 'Teksten er for lang.' })
    .refine((s) => !(multiline ? /[^\P{Cc}\n\t]|\p{Cs}/u : /\p{Cc}|\p{Cs}/u).test(s), {
      message: 'Teksten har teikn som ikkje kan brukast. Skriv han på nytt.',
    });
const line = (max: number) => text(max).transform((s) => s.trim());

export const RATINGS = ['ivaretatt', 'forbetring', 'manglar', 'ikkje_aktuelt'] as const;
export type Rating = (typeof RATINGS)[number];

export const RoundInput = z.strictObject({
  name: line(120).pipe(z.string().min(1, { message: 'Gi runda eit namn.' })),
  template_version_id: z.uuid(),
  clients: z.array(z.uuid()).max(200).default([]),
});
export type RoundInput = z.infer<typeof RoundInput>;

export const ClientsInput = z.strictObject({ clients: z.array(z.uuid()).min(1).max(200) });

const lowerUuid = z.uuid().transform((id) => id.toLowerCase());

/** The people at the table: from the client a role and, if they want, a name; from Vardahei names. */
export const StartInput = z.strictObject({
  held_on: z.iso.date(),
  interviewees: z
    .array(
      z.strictObject({
        role: line(80).pipe(z.string().min(1, { message: 'Skriv rolla til den du snakkar med.' })),
        name: line(120).optional(),
      }),
    )
    .min(1, { message: 'Skriv kven som er med frå kunden.' })
    .max(6),
  interviewers: z
    .array(line(80).pipe(z.string().min(1)))
    .max(6)
    .default([]),
  /** «Endre»: the right client of the round, when the conversation was started with the wrong one. */
  client: lowerUuid.optional(),
  /** The client the screen showed: a move made on a stale screen is refused, not carried out. */
  from: lowerUuid.optional(),
});
export type StartInput = z.infer<typeof StartInput>;

/** The actions of the catalogue chosen for one answer (2.22b), as one field: their ids, lower case,
 * sorted and each once, joined by commas; '' when none. One value per choice, so the choice is saved
 * and compared like any other field. */
export const MAX_ACTIONS = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const actionIds = (value: string): string[] => (value === '' ? [] : value.split(','));
const ACTIONS_MESSAGE = 'Vel tiltak frå katalogen.';
const actionList = z
  .string()
  .max(MAX_ACTIONS * 37, { message: ACTIONS_MESSAGE })
  .refine(
    (s) =>
      actionIds(s).length <= MAX_ACTIONS &&
      actionIds(s).every((id, n, all) => UUID.test(id) && (n === 0 || all[n - 1]! < id)),
    { message: ACTIONS_MESSAGE },
  );

/** One field of one answer. `expect` is the value the screen last saw from the server: the save goes
 * through only while it still holds, so a change from another screen is never overwritten unseen. */
export const AnswerFieldInput = z.discriminatedUnion('field', [
  z.strictObject({
    field: z.literal('rating'),
    value: z.enum(RATINGS).nullable(),
    expect: z.enum(RATINGS).nullable(),
  }),
  z.strictObject({
    field: z.enum(['answer', 'action', 'note']),
    value: text(20_000, true),
    expect: z.string().max(20_000),
  }),
  z.strictObject({
    field: z.literal('actions'),
    value: actionList,
    expect: z.string().max(MAX_ACTIONS * 37, { message: ACTIONS_MESSAGE }),
  }),
]);
export type AnswerFieldInput = z.infer<typeof AnswerFieldInput>;

/** A field of the whole conversation: overall impression, what was agreed, the internal note. */
export const InterviewFieldInput = z.strictObject({
  field: z.enum(['summary', 'agreed', 'note']),
  value: text(20_000, true),
  expect: z.string().max(20_000),
});
export type InterviewFieldInput = z.infer<typeof InterviewFieldInput>;

/** The choice of the overview and its CSV (2.21): one or more rounds (`rounds=<id>,<id>`), and whether
 * conversations going on count too (`in_progress=true`). */
export const OverviewQuery = z.object({
  rounds: z
    .string({ message: 'Vel ei samtalerunde.' })
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(
      z
        .array(z.uuid({ message: 'Vel ei samtalerunde.' }))
        .min(1)
        .max(50),
    ),
  in_progress: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

/** Parse admin input; a rule with its own message says what is wrong. */
export function parseWith<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const own = result.error.issues.find((i) => i.message && !i.message.startsWith('Invalid'));
  throw new BadRequestException(own?.message ?? 'Kontroller opplysningane.');
}
