import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
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
  skipped: string[];
}
@Injectable()
export class RetentionRun {
  constructor(private readonly prisma: PrismaService) {}
  async run(dryRun = false, now = new Date()): Promise<RetentionResult> {
    const config = readRetentionConfig().classes;
    const monthsAgo = new Date(now);
    monthsAgo.setUTCMonth(monthsAgo.getUTCMonth() - config.audit_log.ttl_months);
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
        const result = {
          dry_run: dryRun,
          progress_event: progress.count,
          audit_log: audit.count,
          admin_session: sessions.count,
          connection_log: Number(pruned[0]?.count ?? 0),
          skipped: ['Proposal', 'Registration', 'Contact'],
        };
        if (dryRun) throw new DryRun(result);
        return result;
      });
    } catch (error) {
      if (error instanceof DryRun) return error.result;
      throw error;
    }
  }
}
