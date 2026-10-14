import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  PrivacyService,
  type DeleteScope,
  type PrivacySession,
  UnauthorizedError,
} from '../privacy/privacy.service.js';
import { auditWho } from '../auth/audit-who.js';
import { EventsService } from '../events/events.service.js';

@Injectable()
export class ForgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly privacy: PrivacyService,
    private readonly events: EventsService,
  ) {}
  async forget(
    scope: DeleteScope,
    reason: string,
    session: PrivacySession | undefined,
    dryRun = false,
  ) {
    if (!session) throw new UnauthorizedError();
    if (!reason.trim()) throw new BadRequestException('Skriv inn grunngjevinga.');
    const counts = await this.prisma.$transaction(
      (tx) => this.privacy.store.deleteScope(tx, scope, auditWho(session, true), reason, dryRun),
      { timeout: 120_000 },
    );
    if (!dryRun && counts.total) this.events.changed('responses');
    return { dry_run: dryRun, ...counts };
  }
}
