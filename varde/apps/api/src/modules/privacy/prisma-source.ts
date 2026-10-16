// ResponseSource on Prisma (1.4b): the round mode from Round.identification, responses of a
// round by client (slug) and part; respondent_key only in mode initials; the day only. Also the
// counts of a seminar live poll (3.4) for live.ts. In the allow-list of varde/privacy-only-release
// (reads `response`).
import { NotFoundException } from '@nestjs/common';
import { progressCells } from './progress.js';
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
        submission_id: true,
        source_id: true,
        lang: true,
        duration_s: true,
        free: true,
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
      submission_id: r.submission_id,
      source_id: r.source_id,
      lang: r.lang,
      duration_s: r.duration_s,
      free: (r.free ?? {}) as Readonly<Record<string, unknown>>,
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

export function progressView(prisma: PrismaService, k: number, round: string, now = new Date()) {
  return prisma.$transaction(
    async (tx) => {
      const found = await tx.round.findUnique({
        where: { id: round },
        select: { template_version: { select: { content: true } } },
      });
      if (!found) throw new NotFoundException('Runden finst ikkje.');
      const content = found.template_version?.content as { questions?: unknown[] } | undefined;
      const questionCount = content?.questions?.length ?? 0;
      const clients = await tx.roundClient.findMany({
        where: { round_id: round },
        select: { id: true, population_snapshot: true },
      });
      const events = await tx.progressEvent.findMany({
        where: {
          round_client: { round_id: round },
          at: { gte: new Date(now.getTime() - 24 * 3600_000) },
        },
        select: {
          round_client_id: true,
          session_id: true,
          question_no: true,
          finished: true,
          at: true,
        },
      });
      const durations = await tx.response.findMany({
        where: { round_client: { round_id: round }, part: 'common', duration_s: { not: null } },
        select: { round_client_id: true, duration_s: true },
      });
      const totals = await tx.response.groupBy({
        by: ['round_client_id'],
        where: { round_client: { round_id: round }, part: 'common' },
        _count: { _all: true },
        _max: { submitted_day: true },
      });
      return {
        class: 'aggregate' as const,
        clients: clients.map((rc) => ({
          round_client_id: rc.id,
          population_snapshot: rc.population_snapshot,
          responses_total: totals.find((t) => t.round_client_id === rc.id)?._count._all ?? 0,
          last_response_day:
            totals.find((t) => t.round_client_id === rc.id)?._max.submitted_day ?? null,
          ...progressCells(
            events.filter((e) => e.round_client_id === rc.id),
            durations.filter((d) => d.round_client_id === rc.id).map((d) => d.duration_s!),
            now,
            k,
            questionCount,
          ),
        })),
      };
    },
    { isolationLevel: 'RepeatableRead' },
  );
}

/** Live poll (3.4): how many answered one question of the poll's RoundClient. Each live answer
 * is its own submission with one question (responses/live-answer.ts). */
export async function liveAnswered(db: Db, roundClient: string, question: string): Promise<number> {
  const [row] = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM response
     WHERE round_client_id = ${roundClient}::uuid AND part = 'common' AND answers -> ${question} IS NOT NULL`;
  return row?.n ?? 0;
}

/** Live poll (3.4): answers per option of one question, tallied here; the values never leave
 * modules/privacy (live.ts applies k before anything is shown). A multi answer counts once per
 * chosen option; `n` is the number of answers. */
export async function liveCounts(
  db: Db,
  roundClient: string,
  question: string,
): Promise<{ n: number; counts: Map<string, number> }> {
  const rows = await db.$queryRaw<{ v: unknown }[]>`
    SELECT answers -> ${question} AS v FROM response
     WHERE round_client_id = ${roundClient}::uuid AND part = 'common' AND answers -> ${question} IS NOT NULL`;
  const counts = new Map<string, number>();
  for (const { v } of rows)
    for (const option of new Set(Array.isArray(v) ? v : [v]))
      if (typeof option === 'string') counts.set(option, (counts.get(option) ?? 0) + 1);
  return { n: rows.length, counts };
}
