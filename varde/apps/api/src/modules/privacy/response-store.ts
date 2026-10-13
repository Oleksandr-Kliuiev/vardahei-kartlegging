// Writes of Response (1.8; also 1.16): the only insert path, inside the caller's transaction.
// Never returns `answers` or `respondent_key`. In the allow-list of varde/privacy-only-release;
// reached from outside only as `PrivacyService.store`.
import type { Prisma } from '@prisma/client';
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

export class ResponseStore {
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
  ): Promise<{ content_hash: string } | null> {
    return tx.response.findUnique({
      where: { submission_id: submissionId },
      select: { content_hash: true },
    });
  }
}
