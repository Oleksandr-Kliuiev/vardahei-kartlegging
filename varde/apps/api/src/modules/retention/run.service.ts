// Daily retention job (1.31, ADR-017): every class with a deadline, in one transaction. A dry run
// counts and rolls back. Since 3.1: registrations go 90 days after their seminar ended; a contact
// with no registration left and no consent to invitations goes in the same run (decision 16.10);
// contacts confirmed more than a year ago are marked for the yearly check. What a real run removed
// or marked is written to AuditLog (`retention.run`, counts only): the deletion journal of the
// timed classes. No tombstones: after a restore the job removes the same rows again.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PrivacyService } from '../privacy/privacy.service.js';
import { readRetentionConfig } from './retention.config.js';

class DryRun extends Error {
  constructor(readonly result: RetentionResult) {
    super('dry-run');
  }
}
export interface RetentionResult {
  dry_run: boolean;
  progress_event: number;
  audit_log: number;
  admin_session: number;
  connection_log: number;
  registration: number;
  contact: number;
  contact_review: number;
  skipped: string[];
}
@Injectable()
export class RetentionRun {
  constructor(
    private readonly prisma: PrismaService,
    private readonly privacy: PrivacyService,
  ) {}
  async run(dryRun = false, now = new Date()): Promise<RetentionResult> {
    const config = readRetentionConfig().classes;
    const monthsAgo = new Date(now);
    monthsAgo.setUTCMonth(monthsAgo.getUTCMonth() - config.audit_log.ttl_months);
    const yearAgo = new Date(now);
    yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
    const seminarsEnded = new Date(
      now.getTime() - config.registration.after_seminar_days * 86400_000,
    );
    try {
      return await this.prisma.$transaction(async (tx) => {
        const progress = await tx.progressEvent.deleteMany({
          where: {
            at: { lt: new Date(now.getTime() - config.progress_event.ttl_hours * 3600_000) },
          },
        });
        const audit = await tx.auditLog.deleteMany({ where: { at: { lt: monthsAgo } } });
        const sessions = await tx.adminSession.deleteMany({
          where: {
            expires_at: {
              lt: new Date(now.getTime() - config.admin_session.after_expiry_days * 86400_000),
            },
          },
        });
        const pruned = await tx.$queryRaw<{ count: bigint }[]>`SELECT varde_audit.prune() AS count`;
        const registration = await this.privacy.participants.expire(tx, seminarsEnded);
        const contact = await this.privacy.participants.removeUnused(tx);
        const review = await this.privacy.participants.flagReviews(tx, yearAgo, now);
        const counts = {
          progress_event: progress.count,
          audit_log: audit.count,
          admin_session: sessions.count,
          connection_log: Number(pruned[0]?.count ?? 0),
          registration,
          contact,
          contact_review: review,
        };
        const result = { dry_run: dryRun, ...counts, skipped: ['Proposal'] };
        if (dryRun) throw new DryRun(result);
        if (Object.values(counts).some((n) => n > 0))
          await tx.auditLog.create({
            data: { who: 'system:retention', what: 'retention.run', details: counts },
          });
        return result;
      });
    } catch (error) {
      if (error instanceof DryRun) return error.result;
      throw error;
    }
  }
}
