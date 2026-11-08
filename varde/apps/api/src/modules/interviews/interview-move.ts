// «Feil kunde» (the concept of Samtalar, «ошиблись клиентом»): a conversation started with the wrong
// client moves, in «Endre» and until it is finished, to the right client of the same round with all that
// is written in it. The right client's place in the round was only waiting (nothing is written in a
// conversation not started), so it goes; the wrong client gets a new place, not started. One conversation
// per client per round holds throughout. AuditLog has who, the round and both clients.
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export async function moveToClient(
  tx: Tx,
  i: { id: string; interview_round_id: string; client_id: string; status: string },
  client: string,
  who: string,
) {
  if (i.status !== 'in_progress')
    throw new ConflictException(
      'Berre ein samtale som er i gang, kan flyttast til ein annan kunde.',
    );
  const round = i.interview_round_id;
  // Found and locked at once: a start of the same place waits, and is then refused as not there.
  const [place] = await tx.$queryRaw<{ id: string; status: string }[]>`
    SELECT id, status FROM interview
    WHERE interview_round_id = ${round}::uuid AND client_id = ${client}::uuid FOR UPDATE`;
  if (!place) throw new NotFoundException('Kunden er ikkje med i denne runda.');
  if (place.status !== 'planned')
    throw new ConflictException('Denne kunden har alt ein samtale i runda.');
  // A follow-up belongs to the client it was made for: it is undone on purpose, not moved along.
  const followed = await tx.interviewAction.count({
    where: { interview_id: i.id, OR: [{ closed: true }, { seminar_id: { not: null } }] },
  });
  if (followed)
    throw new ConflictException(
      'Eit tiltak frå samtalen er alt følgt opp på kundesida. Sett det til Open først.',
    );
  await tx.interview.delete({ where: { id: place.id } });
  await tx.interview.update({ where: { id: i.id }, data: { client_id: client } });
  await tx.interview.create({ data: { interview_round_id: round, client_id: i.client_id } });
  await tx.auditLog.create({
    data: {
      who,
      what: 'interviews.client',
      target: `interview:${i.id}`,
      details: { round, from: i.client_id, to: client },
    },
  });
}
