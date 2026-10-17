// Settings of the admin (2.16, decision 6 of 17.10): the contact, sender and opening hours that new
// surveys take. Until someone saves them, they come from the newest published survey of the clients.
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { LocalizedText } from '@varde/schema/template/texts';
import { PrismaService } from '../../prisma/prisma.service.js';

const Contact = z.strictObject({
  name: z.string().trim().max(120),
  phone: z.string().trim().max(40),
  email: z.string().trim().max(200),
  hours: LocalizedText,
});
export const Defaults = z.strictObject({ contact: Contact, sender: LocalizedText });
export type Defaults = z.infer<typeof Defaults>;
const filled = z.string().trim().min(1, 'Feltet kan ikkje vere tomt.');
/** Saved settings: everything a new survey needs is filled in, in Nynorsk at least. */
export const DefaultsInput = z.strictObject({
  contact: z.strictObject({
    name: filled.max(120),
    phone: filled.max(40),
    email: z.email('Skriv ei gyldig e-postadresse.').max(200),
    hours: LocalizedText.extend({ nn: filled.max(200) }),
  }),
  sender: LocalizedText.extend({ nn: filled.max(200) }),
});

const EMPTY: Defaults = {
  contact: { name: '', phone: '', email: '', hours: { nn: '' } },
  sender: { nn: '' },
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `saved` says whether someone has saved them, or they are taken from the newest survey. */
  async defaults(
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Defaults & { saved: boolean }> {
    const row = await db.appSetting.findUnique({ where: { key: 'defaults' } });
    const stored = row ? Defaults.safeParse(row.value) : null;
    if (stored?.success) return { ...stored.data, saved: true };
    const v = await db.templateVersion.findFirst({
      where: { status: 'published', template: { audience: 'client_survey' } },
      orderBy: { published_at: 'desc' },
      select: { content: true },
    });
    const intro = (v?.content as { intro?: { contact?: unknown; sender?: unknown } } | null)?.intro;
    const taken = Defaults.safeParse({ contact: intro?.contact, sender: intro?.sender });
    return { ...(taken.success ? taken.data : EMPTY), saved: false };
  }

  save(value: z.infer<typeof DefaultsInput>, who: string) {
    return this.prisma.$transaction(async (tx) => {
      const json = value as unknown as Prisma.InputJsonValue;
      await tx.appSetting.upsert({
        where: { key: 'defaults' },
        create: { key: 'defaults', value: json, updated_by: who },
        update: { value: json, updated_by: who, updated_at: new Date() },
      });
      await tx.auditLog.create({
        data: { who, what: 'settings.update', target: 'app_setting:defaults' },
      });
      return { ...value, saved: true };
    });
  }
}
