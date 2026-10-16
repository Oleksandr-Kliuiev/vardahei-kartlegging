// Answers of a seminar live poll (3.4, 3.6) go through the ordinary Submission API (ADR-006): one
// submission per question, common part, the answer and nothing else (no role, no free text). The
// check runs in the submission transaction after the round lock, which every step of the poll takes
// as well (live-poll.service.ts): the question must be open at this moment. A closed question is
// refused with «Spørsmålet er stengt.»; a replay of an answer already stored is answered before this
// check (idempotent, ADR-006), so a lost acknowledgement never turns into a refusal.
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Submission } from './submission.schema.js';

export const LIVE_CLOSED = 'Spørsmålet er stengt.';
export const LIVE_NOT_YET = 'Spørsmålet er ikkje ope enno.';

export async function checkLiveAnswer(
  tx: Prisma.TransactionClient,
  round: string,
  payload: Omit<Submission, 'submission_id'>,
): Promise<string> {
  const ids = Object.keys(payload.answers);
  if (
    payload.part !== 'common' ||
    payload.role !== undefined ||
    Object.keys(payload.free ?? {}).length > 0 ||
    ids.length !== 1
  )
    throw new BadRequestException('Innsendinga er ikkje gyldig.');
  const q = await tx.livePollQuestion.findUnique({
    where: { round_id_question_id: { round_id: round, question_id: ids[0]! } },
    select: { question_id: true, state: true },
  });
  if (!q) throw new BadRequestException('Spørsmålet finst ikkje.');
  if (q.state === 'waiting') throw new ConflictException(LIVE_NOT_YET);
  if (q.state !== 'open') throw new ConflictException(LIVE_CLOSED);
  return q.question_id;
}
