// Writes of Response (1.8; also 1.16): the only insert path, inside the caller's transaction.
// Never returns `answers` or `respondent_key`. In the allow-list of varde/privacy-only-release;
// reached from outside only as `PrivacyService.store`.
import type { Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import type { Part } from '@varde/schema/metrics/populations';

export interface ResponsePart {
  round_client_id: string;
  part: Part;
  role: string | null;
  lang: 'nn' | 'en' | 'nb';
  respondent_key: string | null;
  answers: Record<string, unknown>;
  free: Record<string, string>;
  submission_id: string;
  content_hash: string;
  source_id: string | null;
  duration_s: number | null;
  /** YYYY-MM-DD */
  submitted_day: string;
}

export type DeleteScope =
  | { scope: 'client'; client: string }
  | { scope: 'respondent'; client: string; respondent_key: string; round?: string | undefined }
  | { scope: 'submissions'; submission_ids: string[] };
export interface DeleteCounts {
  common: number;
  leader: number;
  total: number;
}

export class ResponseStore {
  async lockSubmissions(tx: Prisma.TransactionClient, ids: readonly string[]): Promise<void> {
    for (const id of [...new Set(ids.map((id) => id.toLowerCase()))].sort())
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
  }

  private whereScope(scope: DeleteScope): Prisma.ResponseWhereInput {
    if (scope.scope === 'submissions') return { submission_id: { in: scope.submission_ids } };
    return {
      round_client: {
        client_id: scope.client,
        ...(scope.scope === 'respondent' && scope.round ? { round_id: scope.round } : {}),
        ...(scope.scope === 'respondent' ? { round: { identification: 'initials' } } : {}),
      },
      ...(scope.scope === 'respondent' ? { respondent_key: scope.respondent_key } : {}),
    };
  }
  /** Selection, UUID serialization, tombstones and delete share the caller's transaction.
   * UUID locks are sorted to avoid deadlocks between overlapping requests. */
  async deleteScope(
    tx: Prisma.TransactionClient,
    scope: DeleteScope,
    who: string,
    reason: string,
    dryRun = false,
  ): Promise<DeleteCounts> {
    if (scope.scope === 'respondent') {
      if (scope.round) {
        const r = await tx.round.findUnique({ where: { id: scope.round } });
        if (!r || r.identification === 'none')
          throw new BadRequestException('Runden har ikkje initialar.');
      } else if (
        !(await tx.roundClient.count({
          where: { client_id: scope.client, round: { identification: 'initials' } },
        }))
      ) {
        throw new BadRequestException('Vel ein identifisert runde.');
      }
    }
    const where = this.whereScope(scope);
    const ids =
      scope.scope === 'submissions'
        ? scope.submission_ids
        : (await tx.response.findMany({ where, select: { submission_id: true } })).map(
            (r) => r.submission_id,
          );
    for (const id of [...new Set(ids.map((id) => id.toLowerCase()))].sort())
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
    const found = await tx.response.findMany({
      where: { AND: [where, { submission_id: { in: ids } }] },
      select: {
        submission_id: true,
        part: true,
        content_hash: true,
        source_id: true,
        respondent_key: true,
        round_client: { select: { round_id: true, client_id: true } },
      },
    });
    const counts = {
      common: found.filter((r) => r.part === 'common').length,
      leader: found.filter((r) => r.part === 'leader').length,
      total: found.length,
    };
    if (dryRun || !found.length) return counts;
    const request = await tx.deletionRequest.create({
      data: { requested_by: who, reason, scope: scope.scope, scope_ref: scope },
    });
    await tx.deletionTombstone.createMany({
      data: found.map((r) => ({
        request_id: request.id,
        submission_id: r.submission_id,
        content_hash: r.content_hash,
        round_id: r.round_client.round_id,
        client_id: r.round_client.client_id,
        part: r.part,
        source_id: r.source_id,
        respondent_key: r.respondent_key,
      })),
    });
    await tx.response.deleteMany({
      where: { submission_id: { in: found.map((r) => r.submission_id) } },
    });
    await tx.auditLog.create({
      data: {
        who,
        what: 'retention.forget',
        target: request.id,
        details: { scope: scope.scope, reason, ...counts },
      },
    });
    return counts;
  }
  /** Reapply a latest ledger after restoring an older DB; part identity survives archive cleaning. */
  async applyLedger(tx: Prisma.TransactionClient): Promise<number> {
    const tombstones = await tx.deletionTombstone.findMany({
      select: { submission_id: true, source_id: true, part: true },
    });
    for (const id of [...new Set(tombstones.map((t) => t.submission_id.toLowerCase()))].sort())
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
    let removed = 0;
    for (const t of tombstones)
      removed += (
        await tx.response.deleteMany({
          where: {
            OR: [
              { submission_id: t.submission_id },
              ...(t.source_id ? [{ source_id: t.source_id, part: t.part }] : []),
            ],
          },
        })
      ).count;
    return removed;
  }

  async insertParts(tx: Prisma.TransactionClient, parts: readonly ResponsePart[]): Promise<number> {
    if (parts.length === 0) return 0;
    const r = await tx.response.createMany({
      data: parts.map((p) => ({
        ...p,
        answers: p.answers as Prisma.InputJsonValue,
        free: p.free,
        submitted_day: new Date(`${p.submitted_day}T00:00:00Z`),
      })),
    });
    return r.count;
  }

  /** (source_id, part) pairs that already exist. */
  async existingKeys(
    tx: Prisma.TransactionClient,
    sourceIds: readonly string[],
  ): Promise<{ source_id: string; part: Part }[]> {
    if (sourceIds.length === 0) return [];
    const rows = await tx.response.findMany({
      where: { source_id: { in: [...sourceIds] } },
      select: { source_id: true, part: true },
    });
    return rows.map((r) => ({
      source_id: r.source_id ?? '',
      part: r.part === 'leader' ? 'leader' : 'common',
    }));
  }

  async findBySubmission(
    tx: Prisma.TransactionClient,
    submissionId: string,
  ): Promise<{ content_hash: string; round_client_id: string } | null> {
    return tx.response.findUnique({
      where: { submission_id: submissionId },
      select: { content_hash: true, round_client_id: true },
    });
  }

  count(tx: Prisma.TransactionClient, roundClient: string): Promise<number> {
    return tx.response.count({ where: { round_client_id: roundClient } });
  }
}
