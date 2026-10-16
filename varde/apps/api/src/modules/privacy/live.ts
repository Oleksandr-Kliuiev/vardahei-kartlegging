// Seminar live poll (3.4, 3.5; ADR-015, ADR-021): the only outputs of its answers. «N har svart»
// is the exact count of one question — the named exception of ADR-021 rule 6 (it tells that people
// took part, not what they answered). The result of a question leaves only after the presenter has
// shown it (state `released`, read here, in the caller's transaction) and only as class
// `aggregate` with k: with fewer than k answers no number leaves at all. Answers to a closed
// question are refused and `released` is final, so a shown result never changes by a new answer
// (no differencing on the big screen). Reached as `PrivacyService.live`.
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { liveAnswered, liveCounts } from './prisma-source.js';

type Db = PrismaService | Prisma.TransactionClient;

export interface LiveOptionResult {
  id: string;
  count: number;
  /** count / n: a multi question can add up to more than 1. */
  share: number;
}
export type LiveResult =
  | { class: 'aggregate'; suppressed: true }
  | { class: 'aggregate'; suppressed: false; n: number; options: LiveOptionResult[] };

export class LiveTally {
  constructor(private readonly k: () => number) {}

  private async roundClient(db: Db, round: string): Promise<string | null> {
    const rc = await db.roundClient.findFirst({
      where: { round_id: round, round: { type: 'live' } },
      select: { id: true },
    });
    return rc?.id ?? null;
  }

  /** «N har svart» for one question of a live round. */
  async answered(db: Db, round: string, question: string): Promise<number> {
    const rc = await this.roundClient(db, round);
    return rc === null ? 0 : liveAnswered(db, rc, question);
  }

  /** The shown result of one question, in the order of `options`; null until it is released. */
  async released(
    db: Db,
    round: string,
    question: string,
    options: readonly string[],
  ): Promise<LiveResult | null> {
    const state = await db.livePollQuestion.findUnique({
      where: { round_id_question_id: { round_id: round, question_id: question } },
      select: { state: true },
    });
    if (state?.state !== 'released') return null;
    const rc = await this.roundClient(db, round);
    if (rc === null) return null;
    const { n, counts } = await liveCounts(db, rc, question);
    if (n < this.k()) return { class: 'aggregate', suppressed: true };
    return {
      class: 'aggregate',
      suppressed: false,
      n,
      options: options.map((id) => ({
        id,
        count: counts.get(id) ?? 0,
        share: (counts.get(id) ?? 0) / n,
      })),
    };
  }
}
