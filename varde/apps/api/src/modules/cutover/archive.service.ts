import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface ArchiveState {
  sha256: string;
  cutover_date: string;
  report_date: string | null;
  delete_by: string;
  deleted: boolean;
}
export function date(value: string): Date {
  const d = new Date(value + 'T00:00:00Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(d.getTime()) ||
    d.toISOString().slice(0, 10) !== value
  )
    throw new BadRequestException('Datoen er ikkje gyldig.');
  return d;
}
export function deleteBy(cutover: string, report?: string | null): string {
  const deadline = new Date(date(cutover).getTime() + 90 * 86400_000);
  return new Date(Math.min(deadline.getTime(), report ? date(report).getTime() : Infinity))
    .toISOString()
    .slice(0, 10);
}
@Injectable()
export class ArchiveService {
  constructor(private readonly prisma: PrismaService) {}
  private async state(tx: Prisma.TransactionClient): Promise<ArchiveState | null> {
    const row = await tx.auditLog.findFirst({
      where: {
        what: {
          in: [
            'cutover.archive',
            'cutover.report-date',
            'cutover.archive-deleted',
            'cutover.archive-restored',
          ],
        },
      },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
    });
    return row?.details as unknown as ArchiveState | null;
  }
  private async write(
    what: string,
    who: string,
    build: (previous: ArchiveState | null) => ArchiveState,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('cutover.archive', 0))`;
      const state = build(await this.state(tx));
      await tx.auditLog.create({
        data: {
          who,
          what,
          target: 'cutover-archive',
          details: state as unknown as Prisma.InputJsonObject,
        },
      });
      return state;
    });
  }
  register(sha256: string, cutover_date: string, report_date?: string) {
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new BadRequestException('Hashen er ikkje gyldig.');
    const delete_by = deleteBy(cutover_date, report_date);
    return this.write('cutover.archive', 'cli:cutover', () => ({
      sha256,
      cutover_date,
      report_date: report_date ?? null,
      delete_by,
      deleted: false,
    }));
  }
  report(report_date: string) {
    date(report_date);
    return this.write('cutover.report-date', 'cli:cutover', (s) => {
      if (!s) throw new NotFoundException('Arkivet er ikkje registrert.');
      return { ...s, report_date, delete_by: deleteBy(s.cutover_date, report_date) };
    });
  }
  mark(event: 'archive-deleted' | 'archive-restored') {
    return this.write('cutover.' + event, 'cli:cutover', (s) => {
      if (!s) throw new NotFoundException('Arkivet er ikkje registrert.');
      return { ...s, deleted: event === 'archive-deleted' };
    });
  }
  async reminder(now = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      const s = await this.state(tx);
      if (!s || s.deleted || date(s.delete_by).getTime() - now.getTime() > 14 * 86400_000)
        return null;
      return { delete_by: s.delete_by, overdue: date(s.delete_by) < now };
    });
  }
}
