// Keeping a conversation round tidy (10.11): its name, and the end of the tour. Until now a round
// could only be made — a typo in its name stood for good, and a round that was over kept its place
// in the chooser beside the one in use. «Samtalerunda er avslutta» was already the server's answer
// to a client added to a closed round; what was missing was a way to close one.
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
        const before = await tx.interviewRound.findUnique({ where: { id }, select: { name: true } });
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
   * A round nobody has sat down in: made by mistake, or to try the thing out. Deleting it takes the
   * planned conversations with it — rows that hold no word anyone said, only «we meant to talk to
   * this client». The moment one conversation is started the round keeps everything, because what is
   * written in it is `samtale` (ADR-017) and leaves only through «Personvern → Sletting», which
   * writes a deletion request and a ledger entry. Closing is what tidies those away.
   */
  async remove(id: string, actor: Actor) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM interview_round WHERE id = ${id}::uuid FOR UPDATE`;
      const round = await tx.interviewRound.findUnique({
        where: { id },
        include: { interviews: { select: { id: true, status: true } } },
      });
      if (round === null) throw new NotFoundException('Samtalerunda finst ikkje.');
      const started = round.interviews.filter((i) => i.status !== 'planned');
      if (started.length > 0)
        throw new ConflictException(
          'Her er det alt samtalar, så runda kan ikkje slettast. Avslutt henne i staden.',
        );
      // `Interview.round` is Restrict, so the planned ones go first and in the same transaction.
      await tx.interview.deleteMany({ where: { interview_round_id: id } });
      await tx.interviewRound.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          who: actor.audit,
          what: 'interviews.round.delete',
          target: `interview_round:${id}`,
          details: { name: round.name, planned: round.interviews.length },
        },
      });
      return { id };
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
