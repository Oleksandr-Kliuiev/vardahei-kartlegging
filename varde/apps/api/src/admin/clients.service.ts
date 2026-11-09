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
const ClientInput = z.strictObject({
  name: z.string().trim().min(1).max(200),
  employee_count: Count,
});
const CountInput = z.strictObject({ employee_count: Count });

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
      const data = parsed.data;
      const result = id
        ? await tx.client.update({ where: { id }, data })
        : await tx.client.create({
            data: { ...ClientInput.parse(data), slug: `kunde-${randomUUID()}` },
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
      };
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
