import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventsService } from '../modules/events/events.service.js';

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
  ) {}

  async save(id: string | null, body: unknown, who: string, countOnly = false) {
    const parsed = (countOnly ? CountInput : ClientInput).safeParse(body);
    if (!parsed.success) throw new BadRequestException('Kontroller namn og talet på tilsette.');
    const client = await this.prisma.$transaction(async (tx) => {
      if (id && !(await tx.client.findUnique({ where: { id } })))
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
}
