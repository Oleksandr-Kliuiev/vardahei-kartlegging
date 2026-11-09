import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventsService } from '../modules/events/events.service.js';
import { interviewCountForClient } from '../modules/interviews/interview-actions.js';
import { PrivacyService } from '../modules/privacy/privacy.service.js';

const Count = z.number().int().min(1).max(9999).nullable();
/** A tag as it is stored: trimmed, lower case, no control characters. «IT» and «it» are one tag. */
const Tag = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .refine((t) => !/\p{Cc}/u.test(t), { message: 'Merkelappen har teikn som ikkje kan brukast.' })
  .transform((t) => t.toLocaleLowerCase('nb'));
const Tags = z
  .array(Tag)
  .max(6)
  .transform((list) => [...new Set(list)]);
const Name = z.string().trim().min(1).max(200);
const ClientInput = z.strictObject({
  name: Name,
  employee_count: Count,
  /** Left out means the tags stay as they are; an empty list clears them. */
  tags: Tags.optional(),
});
const CountInput = z.strictObject({ employee_count: Count });
/** «Legg til fleire»: one line per client, already split by the admin (wave A). */
const BatchInput = z.strictObject({
  clients: z
    .array(z.strictObject({ name: Name, employee_count: Count, tags: Tags.default([]) }))
    .min(1)
    .max(200),
});
export const clientFields = {
  id: true,
  name: true,
  slug: true,
  employee_count: true,
  tags: true,
  archived_at: true,
} as const;

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly privacy: PrivacyService,
  ) {}

  async save(id: string | null, body: unknown, who: string, countOnly = false) {
    const parsed = (countOnly ? CountInput : ClientInput).safeParse(body);
    if (!parsed.success) throw new BadRequestException('Kontroller namn og talet på tilsette.');
    const client = await this.prisma.$transaction(async (tx) => {
      if (id && (await tx.client.findUnique({ where: { id } }))?.kind !== 'client')
        throw new NotFoundException('Kunden finst ikkje.');
      // Tags left out of the body mean «as they are», so an update writes only the fields it got.
      const input = parsed.data;
      const full = countOnly ? null : ClientInput.parse(input);
      const tags = full?.tags === undefined ? {} : { tags: full.tags };
      let result;
      if (id)
        result = await tx.client.update({
          where: { id },
          data: {
            ...(full === null ? {} : { name: full.name }),
            employee_count: input.employee_count,
            ...tags,
          },
        });
      else if (full === null)
        throw new BadRequestException('Kontroller namn og talet på tilsette.');
      else
        result = await tx.client.create({
          data: {
            name: full.name,
            employee_count: full.employee_count,
            tags: full.tags ?? [],
            slug: `kunde-${randomUUID()}`,
          },
        });
      await tx.auditLog.create({
        data: {
          who,
          what: id ? 'clients.update' : 'clients.create',
          target: `client:${result.id}`,
        },
      });
      return {
        id: result.id,
        name: result.name,
        slug: result.slug,
        employee_count: result.employee_count,
        tags: result.tags,
        archived_at: result.archived_at,
      };
    });
    this.events.changed('rounds');
    return client;
  }

  /**
   * «Legg til fleire kundar» (wave A): a pasted list in one go, so a campaign of 48 clients is not
   * 48 forms. A name a client already has is left alone and reported back, whatever its case: the
   * admin sees what was added and what was already there, and nothing is created twice by mistake.
   */
  async batch(body: unknown, who: string) {
    const parsed = BatchInput.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Kontroller namna og tala på tilsette.');
    const result = await this.prisma.$transaction(async (tx) => {
      const known = new Map(
        (await tx.client.findMany({ where: { kind: 'client' }, select: { name: true } })).map(
          (c) => [c.name.trim().toLocaleLowerCase('nb'), c.name],
        ),
      );
      const created: { id: string; name: string }[] = [];
      const skipped: string[] = [];
      for (const input of parsed.data.clients) {
        const key = input.name.toLocaleLowerCase('nb');
        if (known.has(key)) {
          skipped.push(input.name);
          continue;
        }
        const made = await tx.client.create({
          data: { ...input, slug: `kunde-${randomUUID()}` },
          select: { id: true, name: true },
        });
        known.set(key, made.name);
        created.push(made);
        await tx.auditLog.create({
          data: { who, what: 'clients.create', target: `client:${made.id}` },
        });
      }
      return { created, skipped };
    });
    if (result.created.length) this.events.changed('rounds');
    return result;
  }

  /**
   * Archives a client, or takes it back (wave B). A client with rounds, seminars or conversations
   * can never be deleted — the answers and the history would go with it — so this is what a
   * duplicate or a client Vardahei no longer works with gets instead: it keeps everything it has
   * and stays out of the lists and the pickers until someone takes it back.
   */
  async archive(id: string, archived: boolean, who: string) {
    const client = await this.prisma.$transaction(async (tx) => {
      if ((await tx.client.findUnique({ where: { id } }))?.kind !== 'client')
        throw new NotFoundException('Kunden finst ikkje.');
      const result = await tx.client.update({
        where: { id },
        data: { archived_at: archived ? new Date() : null },
        select: clientFields,
      });
      await tx.auditLog.create({
        data: {
          who,
          what: archived ? 'clients.archive' : 'clients.unarchive',
          target: `client:${id}`,
        },
      });
      return result;
    });
    this.events.changed('rounds');
    return client;
  }

  /** What keeps a client from being deleted: everything that refers to it, by kind. */
  async ties(id: string, db: Prisma.TransactionClient = this.prisma) {
    if ((await db.client.findUnique({ where: { id } }))?.kind !== 'client')
      throw new NotFoundException('Kunden finst ikkje.');
    const where = { client_id: id };
    const [rounds, seminars, interviews, findings, tombstones, contacts, snapshots] =
      await Promise.all([
        db.roundClient.count({ where }),
        db.seminarClient.count({ where }),
        interviewCountForClient(db, id),
        db.finding.count({ where }),
        db.deletionTombstone.count({ where }),
        this.privacy.participants.clientCount(db, id),
        this.privacy.clientSnapshotCount(db, id),
      ]);
    return {
      rounds,
      seminars,
      interviews,
      contacts: contacts.total,
      history: snapshots + findings + tombstones,
    };
  }

  /**
   * Deletes a client nothing refers to (a duplicate, a mistake). A client with rounds, seminars,
   * conversations, contacts or history is refused: answers and history are never lost this way, and
   * three of those references are plain columns the database would not guard.
   */
  async remove(id: string, who: string) {
    await this.prisma.$transaction(async (tx) => {
      // The row lock holds back a new round or contact until the check and the delete are done.
      await tx.$queryRaw`SELECT id FROM client WHERE id = ${id}::uuid FOR UPDATE`;
      const ties = await this.ties(id, tx);
      if (Object.values(ties).some((n) => n > 0))
        throw new ConflictException(
          'Kunden er knytt til rundar, seminar, samtalar eller kontaktar og kan ikkje slettast.',
        );
      const { name } = await tx.client.delete({ where: { id } });
      await tx.auditLog.create({
        data: { who, what: 'clients.delete', target: `client:${id}`, details: { name } },
      });
    });
    this.events.changed('rounds');
    return { id };
  }
}
