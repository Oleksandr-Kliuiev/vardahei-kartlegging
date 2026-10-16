// Material of a seminar (3.3): a title and a link, no uploaded files. The seminar page shows the
// list after the seminar has ended, to everyone who has its link (an unguessable code, ADR-009).
// Adding and removing are admin actions with AuditLog.
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EventsService } from '../events/events.service.js';

/** http(s) only, no user or password in the link, no control characters. */
export const MaterialInput = z.strictObject({
  title: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((s) => !/\p{Cc}/u.test(s)),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((s) => {
      try {
        const u = new URL(s);
        return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password && !/\s/.test(s);
      } catch {
        return false;
      }
    }, { message: 'Lenkja må byrje med https:// (eller http://).' }),
});
export type MaterialInput = z.infer<typeof MaterialInput>;

export interface MaterialView {
  id: string;
  title: string;
  url: string;
}

/** The material of a seminar in the order it was added. */
export async function materialsOf(db: Prisma.TransactionClient, seminar: string): Promise<MaterialView[]> {
  const rows = await db.seminarMaterial.findMany({
    where: { seminar_id: seminar },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  });
  return rows.map((m) => ({ id: m.id, title: m.title, url: m.url }));
}

@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async add(seminar: string, input: MaterialInput, who: string) {
    const id = await this.prisma.$transaction(async (tx) => {
      if (!(await tx.seminar.count({ where: { id: seminar } })))
        throw new NotFoundException('Seminaret finst ikkje.');
      const m = await tx.seminarMaterial.create({
        data: { seminar_id: seminar, title: input.title, url: input.url, created_by: who },
      });
      await tx.auditLog.create({
        data: { who, what: 'seminars.material.add', target: `seminar:${seminar}`, details: { material: m.id } },
      });
      return m.id;
    });
    this.events.changed('seminars');
    return { id };
  }

  async remove(seminar: string, material: string, who: string) {
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.seminarMaterial.deleteMany({ where: { id: material, seminar_id: seminar } });
      if (!r.count) throw new NotFoundException('Materiellet finst ikkje.');
      await tx.auditLog.create({
        data: { who, what: 'seminars.material.remove', target: `seminar:${seminar}`, details: { material } },
      });
    });
    this.events.changed('seminars');
    return { ok: true };
  }
}
