import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PrivacyService } from '../privacy/privacy.service.js';

@Injectable()
export class DeletionLedger {
  constructor(
    private readonly prisma: PrismaService,
    private readonly privacy: PrivacyService,
  ) {}
  async tombstonesForKartlegging() {
    return this.prisma.deletionTombstone.findMany({
      where: { source_id: { not: null } },
      select: { source_id: true, part: true },
      orderBy: [{ source_id: 'asc' }, { part: 'asc' }],
    });
  }
  /** Responses and (3.1) seminar contacts deleted on request; returns how many rows went. */
  async applyToDatabase(tx: Prisma.TransactionClient) {
    return (
      (await this.privacy.store.applyLedger(tx)) + (await this.privacy.participants.applyLedger(tx))
    );
  }
  apply() {
    return this.prisma.$transaction((tx) => this.applyToDatabase(tx), { timeout: 120_000 });
  }
}
