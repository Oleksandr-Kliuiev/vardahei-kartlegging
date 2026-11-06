import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  PrivacyService,
  type DeleteCounts,
  type DeleteScope,
  type ParticipantDeleteCounts,
  type PrivacySession,
  UnauthorizedError,
} from '../privacy/privacy.service.js';
import { auditWho } from '../auth/audit-who.js';
import { forgetInterviews } from '../interviews/interview-retention.js';
import { EventsService } from '../events/events.service.js';

/** Response scopes (1.31b) and, since 3.1, a seminar participant found by e-mail. */
export type ForgetScope = DeleteScope | { scope: 'participant'; email: string };
/** Response parts and (2.20) conversations; `total` counts both. */
export type ClientCounts = DeleteCounts & { interviews: number };

@Injectable()
export class ForgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly privacy: PrivacyService,
    private readonly events: EventsService,
  ) {}
  forget(
    scope: DeleteScope,
    reason: string,
    session: PrivacySession | undefined,
    dryRun?: boolean,
  ): Promise<ClientCounts & { dry_run: boolean }>;
  forget(
    scope: ForgetScope,
    reason: string,
    session: PrivacySession | undefined,
    dryRun?: boolean,
  ): Promise<(ClientCounts | ParticipantDeleteCounts) & { dry_run: boolean }>;
  async forget(
    scope: ForgetScope,
    reason: string,
    session: PrivacySession | undefined,
    dryRun = false,
  ) {
    if (!session) throw new UnauthorizedError();
    if (!reason.trim()) throw new BadRequestException('Skriv inn grunngjevinga.');
    const who = auditWho(session, true);
    // A dry run is in AuditLog too: who looked and what was found — counts only, no address,
    // initials, client or reason.
    const preview = async (tx: Prisma.TransactionClient, counts: object) => {
      if (dryRun)
        await tx.auditLog.create({
          data: {
            who,
            what: 'retention.forget.preview',
            details: { scope: scope.scope, ...counts },
          },
        });
    };
    if (scope.scope === 'participant') {
      const counts = await this.prisma.$transaction(async (tx) => {
        const found = await this.privacy.participants.forget(tx, scope.email, who, reason, dryRun);
        await preview(tx, found);
        return found;
      });
      if (!dryRun && counts.total) this.events.changed('seminars');
      return { dry_run: dryRun, ...counts };
    }
    // By client: customers only; the technical client of live polls (3.4) is nobody's company.
    if (
      (scope.scope === 'client' || scope.scope === 'respondent') &&
      (await this.prisma.client.findUnique({ where: { id: scope.client } }))?.kind !== 'client'
    )
      throw new BadRequestException('Kunden finst ikkje.');
    const counts = await this.prisma.$transaction(
      async (tx) => {
        const responses = await this.privacy.store.deleteScope(tx, scope, who, reason, dryRun);
        // A client's conversations (2.20, class `samtale`) go with its answers; `total` counts both.
        const interviews =
          scope.scope === 'client'
            ? await forgetInterviews(tx, scope.client, who, reason, dryRun)
            : 0;
        const found = { ...responses, interviews, total: responses.total + interviews };
        await preview(tx, found);
        return found;
      },
      { timeout: 120_000 },
    );
    if (!dryRun && counts.total) this.events.changed('responses');
    return { dry_run: dryRun, ...counts };
  }
}
