// Seminar live poll (3.4, 3.5; ADR-015, ADR-021): the only outputs of its answers. «N har svart»
// of one question leaves with k as the progress counts of the admin do (acceptance of 3b, 16.10):
// from k answers the number, below k none («Færre enn tre har svart»). The result of a question
// leaves only after the presenter has shown it (state `released`, read here, in the caller's
// transaction) and only as class `aggregate` with k: with fewer than k answers no number leaves
// at all. Answers to a closed question are refused and `released` is final, so a shown result
// never changes by a new answer (no differencing on the big screen). The quota of live answers
// gets a yes or no, never the count. Reached as `PrivacyService.live`.
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
/** «N har svart»: the number from k answers up, below k only that there are fewer. */
export type LiveCount =
  { class: 'aggregate'; suppressed: true } | { class: 'aggregate'; suppressed: false; n: number };

export class LiveTally {
  constructor(private readonly k: () => number) {}

  private async roundClient(db: Db, round: string): Promise<string | null> {
    const rc = await db.roundClient.findFirst({
      where: { round_id: round, round: { type: 'live' } },
      select: { id: true },
    });
    return rc?.id ?? null;
  }

  private async count(db: Db, round: string, question: string): Promise<number> {
    const rc = await this.roundClient(db, round);
    return rc === null ? 0 : liveAnswered(db, rc, question);
  }

  /** «N har svart» for one question of a live round, with k. */
  async answered(db: Db, round: string, question: string): Promise<LiveCount> {
    const n = await this.count(db, round, question);
    return n < this.k()
      ? { class: 'aggregate', suppressed: true }
      : { class: 'aggregate', suppressed: false, n };
  }

  /** Whether a question has `max` answers already (the quota of live answers): yes or no. */
  async full(db: Db, round: string, question: string, max: number): Promise<boolean> {
    return (await this.count(db, round, question)) >= max;
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
