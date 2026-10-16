import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { PrivacyService } from '../modules/privacy/privacy.service.js';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly privacy: PrivacyService,
  ) {}

  clients() {
    // The technical client of seminar live polls (3.4) is nobody's customer: never listed.
    return this.prisma.client.findMany({
      where: { kind: 'client' },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        employee_count: true,
      },
    });
  }

  versions() {
    return this.prisma.templateVersion.findMany({
      where: { status: 'published' },
      orderBy: [{ template_id: 'asc' }, { version_no: 'desc' }],
      select: { id: true, label: true, template: { select: { key: true } } },
    });
  }

  /** Rounds with their clients; `released` says a client report can be made (5.1). */
  async rounds() {
    // Live polls belong to their seminar (3.4): not in the lists of rounds, insight or reports.
    const rounds = await this.prisma.round.findMany({
      where: { type: { not: 'live' } },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        // regular, post_seminar (3.8: «Etter» of a seminar) or external_import.
        type: true,
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
    const released = await this.privacy.releasedRoundClients(rounds.map((r) => r.id));
    return rounds.map((r) => ({
      ...r,
      round_clients: r.round_clients.map((rc) => ({ ...rc, released: released.has(rc.id) })),
    }));
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
