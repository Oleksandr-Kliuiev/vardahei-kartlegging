// ResponseSource on Prisma (1.4b): the round mode from Round.identification, responses of a
// round by client (slug) and part; respondent_key only in mode initials; the day only.
// In the allow-list of varde/privacy-only-release (reads `response`).
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ResponseSource, SourceQuery } from './source.js';
import { NotFoundError, type ResponseRow, type RoundMode } from './types.js';

type Db = PrismaService | Prisma.TransactionClient;

export class PrismaResponseSource implements ResponseSource {
  constructor(private readonly prisma: PrismaService) {}

  async roundMode(round: string, tx?: Prisma.TransactionClient): Promise<RoundMode> {
    const db: Db = tx ?? this.prisma;
    const r = await db.round.findUnique({ where: { id: round }, select: { identification: true } });
    if (r === null) throw new NotFoundError('round not found');
    return r.identification === 'initials' ? 'initials' : 'none';
  }

  async read(query: SourceQuery, tx?: Prisma.TransactionClient): Promise<ResponseRow[]> {
    const db: Db = tx ?? this.prisma;
    const mode = await this.roundMode(query.round, tx);
    const found = await db.response.findMany({
      where: {
        ...(query.part === undefined ? {} : { part: query.part }),
        round_client: {
          round_id: query.round,
          ...(query.client === undefined ? {} : { client: { slug: query.client } }),
        },
      },
      select: {
        part: true,
        role: true,
        respondent_key: true,
        answers: true,
        submitted_day: true,
        round_client: { select: { id: true, client: { select: { slug: true } } } },
      },
      orderBy: [{ submitted_day: 'asc' }, { id: 'asc' }],
    });
    return found.map((r) => ({
      round_client: r.round_client.id,
      client: r.round_client.client.slug,
      part: r.part === 'leader' ? 'leader' : 'common',
      role: r.role ?? '',
      ...(mode === 'initials' && r.respondent_key !== null
        ? { respondent_key: r.respondent_key }
        : {}),
      answers: (r.answers ?? {}) as Readonly<Record<string, unknown>>,
      submitted_day: r.submitted_day.toISOString().slice(0, 10),
    }));
  }
}
