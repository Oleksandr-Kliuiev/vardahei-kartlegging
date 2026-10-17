import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import {
  Audience,
  Identification,
  TemplateContentShape,
  type TemplateContent,
} from '@varde/schema/template/template';
import { initialsQuestion, roleQuestion } from '@varde/schema/template/structure';
import { Lang } from '@varde/schema/template/texts';
import { TemplateVersionContent } from '@varde/schema/template/validate';

export const TemplateInput = z.strictObject({
  key: z
    .string()
    .regex(/^[a-z0-9_-]+$/)
    .max(100),
  audience: Audience,
  identification: Identification,
  required_languages: z.array(Lang).min(1).max(3),
});
export const DraftInput = z.strictObject({
  label: z.string().trim().min(1).max(100),
  copy_from: z.uuid().optional(),
});
export const Hash = z.string().regex(/^[a-f0-9]{64}$/);
export const SaveInput = z.strictObject({ content_hash: Hash, content: z.unknown() });
export const AcceptInput = z.strictObject({ content_hash: Hash, lang: Lang });
export const PublishInput = z.strictObject({
  content_hash: Hash,
  confirmed: z.literal(true),
  frozen_changes: z.record(z.string(), z.enum(['orthographic', 'semantic'])).default({}),
});
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success)
    throw new BadRequestException({ message: 'Kontroller felta.', issues: r.error.issues });
  return r.data;
}
/** Issues that only say a draft is not finished (texts, languages, the role and initials questions).
 * A draft may be saved with them (autosave, decision 17.10); accept and publish need none (ADR-019). */
const INCOMPLETE = [
  /^missing (nn|en|nb)$/,
  /requires (nn|en)$/,
  /^exactly one role question$/,
  /^identification initials needs exactly one identifier$/,
  /^leader role .+ is not an option of the role question$/,
];
export const incomplete = (message: string) => INCOMPLETE.some((r) => r.test(message));
export function issues(content: unknown) {
  const r = TemplateVersionContent.safeParse(content);
  return r.success
    ? []
    : r.error.issues.map(({ path, message }) => ({
        path,
        message,
        blocking: !incomplete(message),
      }));
}
export function validated(content: unknown): TemplateContent {
  return parse(TemplateVersionContent, content);
}
/** A draft as the workshop saves it: the schema shape and every reference hold (2.2: a broken
 * reference is never saved), while texts, translations and the role question may still be missing. */
export function validatedDraft(content: unknown): TemplateContent {
  const blocking = issues(content).filter((i) => i.blocking);
  if (blocking.length)
    throw new BadRequestException({ message: 'Kontroller felta.', issues: blocking });
  return parse(TemplateContentShape, content);
}

/** A new draft: the questions its structure needs (decision 5: the role question, and the initials
 * question with identification «initials») in a first section, everything else empty; the shared
 * validator guides the workshop from there. */
export function emptyContent(input: z.infer<typeof TemplateInput>): TemplateContent {
  const langs = input.required_languages;
  const first = input.identification === 'initials' ? [initialsQuestion('Q1', langs)] : [];
  const [head, ...rest] = [...first, roleQuestion(`Q${first.length + 1}`, langs)];
  const section = { nn: 'Om deg', ...(langs.includes('en') ? { en: 'About you' } : {}) };
  return {
    ...input,
    leader_roles: [],
    max_tips: 0,
    tips: [],
    questions: [{ ...head, texts: { ...head.texts, section_title: section } }, ...rest],
    intro: {
      title: { nn: '' },
      short: { nn: '' },
      minutes: 5,
      letter: [],
      sender: { nn: '' },
      facts: [],
      contact: { name: '', phone: '', email: '', hours: { nn: '' } },
    },
    leader_intro: { title: { nn: '' }, text: { nn: '' } },
    invitation: {
      letter: { nn: '{lenkje}{frist}' },
      poster: {
        title: { nn: '' },
        text: { nn: '{lenkje}' },
        footer: { nn: '' },
      },
    },
  };
}
