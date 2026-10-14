import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventsService } from '../modules/events/events.service.js';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  clients() {
    return this.prisma.client.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        employee_count: true,
      },
    });
  }

  async update(id: string, body: unknown, who: string) {
    const parsed = z
      .strictObject({ employee_count: z.number().int().min(1).max(9999).nullable() })
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException('Kontroller talet på tilsette.');
    const client = await this.prisma.$transaction(async (tx) => {
      if (!(await tx.client.findUnique({ where: { id } })))
        throw new NotFoundException('Kunden finst ikkje.');
      const result = await tx.client.update({
        where: { id },
        data: parsed.data,
        select: { id: true, employee_count: true },
      });
      await tx.auditLog.create({
        data: { who: who, what: 'clients.update', target: `client:${id}` },
      });
      return result;
    });
    this.events.changed('rounds');
    return client;
  }

  versions() {
    return this.prisma.templateVersion.findMany({
      where: { status: 'published' },
      orderBy: [{ template_id: 'asc' }, { version_no: 'desc' }],
      select: { id: true, label: true, template: { select: { key: true } } },
    });
  }

  rounds() {
    return this.prisma.round.findMany({
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        status: true,
        template_version_id: true,
        round_clients: {
          orderBy: { client: { name: 'asc' } },
          select: {
            id: true,
            client_id: true,
            status: true,
            deadline: true,
            population_snapshot: true,
            client: { select: { name: true } },
          },
        },
      },
    });
  }

  audit(raw = '40') {
    const limit = z.coerce.number().int().min(1).max(40).safeParse(raw);
    if (!limit.success) throw new BadRequestException('Vel mellom 1 og 40 hendingar.');
    return this.prisma.auditLog.findMany({
      take: limit.data,
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      select: { who: true, what: true, at: true, target: true },
    });
  }
}
