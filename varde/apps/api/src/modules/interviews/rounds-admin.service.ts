// Keeping a conversation round tidy (10.11): its name, and the end of the tour. Until now a round
// could only be made — a typo in its name stood for good, and a round that was over kept its place
// in the chooser beside the one in use. «Samtalerunda er avslutta» was already the server's answer
// to a client added to a closed round; what was missing was a way to close one. Deleting a round or
// one conversation in it, written ones included, came the same evening.
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EventsService } from '../events/events.service.js';
import type { Actor } from './interviews.service.js';

@Injectable()
export class InterviewRoundsAdmin {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  /** A new name for the round. The name is unique, so a clash is told apart from a lost round. */
  async rename(id: string, name: string, actor: Actor) {
    try {
      const round = await this.prisma.$transaction(async (tx) => {
        const before = await tx.interviewRound.findUnique({
          where: { id },
          select: { name: true },
        });
        if (before === null) throw new NotFoundException('Samtalerunda finst ikkje.');
        if (before.name === name) return { name };
        const after = await tx.interviewRound.update({ where: { id }, data: { name } });
        await tx.auditLog.create({
          data: {
            who: actor.audit,
            what: 'interviews.round.rename',
            target: `interview_round:${id}`,
            // The old name, so the journal can be read without the row it describes.
            details: { from: before.name, to: name },
          },
        });
        return { name: after.name };
      });
      this.events.changed('samtalar');
      return round;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Det finst alt ei samtalerunde med dette namnet.');
      throw error;
    }
  }

  /**
   * Deletes a round and every conversation in it (10.11, asked for by Oleksandr: a round made by mistake
   * or to rehearse used to stay for good once one conversation was started). The planned ones hold no
   * word anyone said and simply go. What was written is `samtale` (ADR-017): it goes the way a
   * deletion on request does, with a `deletion_request` per client listing the conversation ids, so a
   * restore from backup deletes them again (`applyInterviewLedger`), and a journal row with counts only.
   */
  async remove(id: string, actor: Actor) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM interview_round WHERE id = ${id}::uuid FOR UPDATE`;
      const round = await tx.interviewRound.findUnique({
        where: { id },
        include: { interviews: { select: { id: true, status: true, client_id: true } } },
      });
      if (round === null) throw new NotFoundException('Samtalerunda finst ikkje.');
      const started = round.interviews.filter((i) => i.status !== 'planned');
      const byClient = new Map<string, string[]>();
      for (const i of started)
        byClient.set(i.client_id, [...(byClient.get(i.client_id) ?? []), i.id]);
      for (const [client, ids] of byClient) await ledger(tx, client, ids, actor);
      // `Interview.round` is Restrict, so the conversations go first and in the same transaction.
      await tx.interview.deleteMany({ where: { interview_round_id: id } });
      await tx.interviewRound.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          who: actor.audit,
          what: 'interviews.round.delete',
          target: `interview_round:${id}`,
          details: {
            name: round.name,
            planned: round.interviews.length - started.length,
            started: started.length,
          },
        },
      });
      return { id };
    });
    this.events.changed('samtalar');
    return result;
  }

  /**
   * Deletes one conversation (10.11): a client taken off the round, a conversation started on the wrong
   * client or held for practice. A planned one is a line in a list; one with anything written goes with
   * a `deletion_request`, as a whole round does.
   */
  async removeInterview(id: string, actor: Actor) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM interview WHERE id = ${id}::uuid FOR UPDATE`;
      const interview = await tx.interview.findUnique({
        where: { id },
        select: { id: true, status: true, client_id: true, interview_round_id: true },
      });
      if (interview === null) throw new NotFoundException('Samtalen finst ikkje.');
      const request =
        interview.status === 'planned'
          ? null
          : await ledger(tx, interview.client_id, [interview.id], actor);
      await tx.interview.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          who: actor.audit,
          what: 'interviews.delete',
          target: `interview:${id}`,
          details: {
            round: interview.interview_round_id,
            status: interview.status,
            ...(request ? { deletion_request: request } : {}),
          },
        },
      });
      return { id, round: interview.interview_round_id };
    });
    this.events.changed('samtalar');
    return result;
  }

  /**
   * Closing a round ends the tour: no client can be added to it and no conversation in it can be
   * started. What is written stays, the referats stay readable, and opening the round again undoes
   * all of it — so this is a tidy-up, never a deletion.
   */
  async setOpen(id: string, open: boolean, actor: Actor) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM interview_round WHERE id = ${id}::uuid FOR UPDATE`;
      const round = await tx.interviewRound.findUnique({
        where: { id },
        include: { interviews: { select: { status: true } } },
      });
      if (round === null) throw new NotFoundException('Samtalerunda finst ikkje.');
      const wanted = open ? 'open' : 'closed';
      if (round.status === wanted)
        throw new ConflictException(
          open ? 'Samtalerunda er open alt.' : 'Samtalerunda er avslutta alt.',
        );
      await tx.interviewRound.update({
        where: { id },
        data: { status: wanted, closed_at: open ? null : new Date() },
      });
      await tx.auditLog.create({
        data: {
          who: actor.audit,
          what: open ? 'interviews.round.reopen' : 'interviews.round.close',
          target: `interview_round:${id}`,
          details: {
            unfinished: round.interviews.filter((i) => i.status !== 'done').length,
          },
        },
      });
      return { status: wanted };
    });
    this.events.changed('samtalar');
    return result;
  }
}

/** The ledger row that keeps deleted conversations deleted after a restore (scope `client`, as for a
 * deletion on request, so `applyInterviewLedger` replays it unchanged). */
async function ledger(
  tx: Prisma.TransactionClient,
  client: string,
  interviews: string[],
  actor: Actor,
): Promise<string> {
  const request = await tx.deletionRequest.create({
    data: {
      requested_by: actor.audit,
      reason: 'Sletta i Samtalar',
      scope: 'client',
      scope_ref: { scope: 'client', client, interviews },
    },
  });
  return request.id;
}
