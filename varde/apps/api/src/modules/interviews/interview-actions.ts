// Actions of the catalogue chosen in a conversation (2.22b, decision 3.3 of 07.11): under «Konklusjon og
// tiltak» Vardahei may pick one or more actions of the catalogue (`action`, 3.1) for an answer. The choice
// is one more field of the answer (`actions`: the sorted ids joined by commas), saved against the value
// the screen last saw like the other fields (interviews.service). Each chosen action is then followed up
// like a finding: open, taken up at a seminar, done; who changed it and when; every change in AuditLog.
// Data class `samtale` (ADR-017): the rows go with the answer, so with the conversation.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { namesOf } from '../auth/people.js';
import { EventsService } from '../events/events.service.js';
import type { FindingStatusInput } from '../seminars/seminar-input.js';
import { actionIds } from './interview-input.js';
import { guideQuestions } from './interview-view.js';

type Tx = Prisma.TransactionClient;
type Key = { interview_id: string; question_id: string };

/** The value of the `actions` field: the chosen ids, sorted, joined by commas ('' when none). */
export const actionsValue = (rows: readonly { action_id: string }[]) =>
  rows
    .map((r) => r.action_id)
    .sort()
    .join(',');

/** The follow-up of a chosen action in the words of findings (3.1). `in_seminar` is an open action with
 * a seminar: when the seminar is deleted it is open again, and one closed in it stays closed, as
 * seminars.service does for findings (through reopenForSeminar below). */
export const statusOf = (r: { closed: boolean; seminar_id: string | null }) =>
  r.closed ? 'closed' : r.seminar_id ? 'in_seminar' : 'open';

/** A seminar is being deleted (seminars.remove, in its transaction): the actions taken up in it go back
 * to open and the closed ones lose the link, both with who deleted it and when, as findings do. The
 * foreign key would clear the link too, but silently and under the old name (acceptance of 2.22b).
 * Returns how many went back to open, for the seminar's AuditLog. */
export async function reopenForSeminar(tx: Tx, seminar: string, who: string, now: Date) {
  const reopened = await tx.interviewAction.updateMany({
    where: { seminar_id: seminar, closed: false },
    data: { seminar_id: null, changed_by: who, changed_at: now },
  });
  await tx.interviewAction.updateMany({
    where: { seminar_id: seminar },
    data: { seminar_id: null, changed_by: who, changed_at: now },
  });
  return reopened.count;
}

/** Saves the chosen actions of one answer, after the compare-and-set of the field: every id must be in
 * the catalogue; an action that stays keeps its follow-up, a new one starts open. */
export async function saveActions(tx: Tx, key: Key, value: string, by: string) {
  const wanted = actionIds(value);
  if (wanted.length && (await tx.action.count({ where: { id: { in: wanted } } })) !== wanted.length)
    throw new BadRequestException('Eit av tiltaka finst ikkje i katalogen. Last sida på nytt.');
  const now = new Date();
  await tx.interviewAnswer.upsert({
    where: { interview_id_question_id: key },
    create: { ...key, updated_at: now, updated_by: by },
    update: { updated_at: now, updated_by: by },
  });
  await tx.interviewAction.deleteMany({ where: { ...key, action_id: { notIn: wanted } } });
  await tx.interviewAction.createMany({
    data: wanted.map((action_id) => ({ ...key, action_id })),
    skipDuplicates: true,
  });
  await tx.interview.update({ where: { id: key.interview_id }, data: { updated_at: now } });
  return { value, updated_at: now };
}

const day = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10));

@Injectable()
export class InterviewActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  /** The actions chosen in one client's conversations (the client page, «Funn»), newest round first, then
   * in the order of the guide: the conversation, the question, the action with its seminar topic and the
   * follow-up. Never what was typed: no answer, conclusion or note. */
  async ofClient(client: string) {
    const found = await this.prisma.client.findUnique({
      where: { id: client },
      select: { kind: true },
    });
    if (found?.kind !== 'client') throw new NotFoundException('Kunden finst ikkje.');
    const interviews = await this.prisma.interview.findMany({
      where: { client_id: client, answers: { some: { actions: { some: {} } } } },
      orderBy: { round: { created_at: 'desc' } },
      select: {
        id: true,
        status: true,
        held_on: true,
        round: {
          select: { id: true, name: true, template_version: { select: { content: true } } },
        },
        answers: {
          where: { actions: { some: {} } },
          select: {
            question_id: true,
            actions: {
              select: {
                action_id: true,
                closed: true,
                seminar_id: true,
                changed_by: true,
                changed_at: true,
                action: { select: { id: true, name: true, seminar_topic: true } },
                seminar: { select: { id: true, topic_nn: true, starts_at: true } },
              },
            },
          },
        },
      },
    });
    // A status set here names the admin; a seminar deleted names its Entra id, as for findings: the
    // same lookup turns that into a name (the client page never shows an id).
    const names = await namesOf(
      this.prisma,
      interviews.flatMap((i) => i.answers.flatMap((a) => a.actions.map((x) => x.changed_by))),
    );
    return {
      rows: interviews.flatMap((i) => {
        const questions = guideQuestions(i.round.template_version.content);
        const no = (id: string) => questions.findIndex((q) => q.id === id);
        return i.answers
          .sort((a, b) => no(a.question_id) - no(b.question_id))
          .flatMap((a) => {
            const q = questions[no(a.question_id)];
            return a.actions
              .sort((x, y) => x.action.name.localeCompare(y.action.name, 'nn'))
              .map((x) => ({
                interview: i.id,
                conversation: {
                  status: i.status,
                  held_on: day(i.held_on),
                  round: { id: i.round.id, name: i.round.name },
                },
                question: {
                  id: a.question_id,
                  no: no(a.question_id) + 1,
                  short: q?.short ?? a.question_id,
                },
                action: x.action,
                status: statusOf(x),
                seminar: x.seminar
                  ? {
                      id: x.seminar.id,
                      topic: x.seminar.topic_nn,
                      starts_at: x.seminar.starts_at.toISOString(),
                    }
                  : null,
                changed_by: x.changed_by === null ? null : (names[x.changed_by] ?? x.changed_by),
                changed_at: x.changed_at?.toISOString() ?? null,
              }));
          });
      }),
    };
  }

  /** The follow-up of one chosen action, with the same choices as a finding: open, taken up at a
   * seminar, done (a done action keeps its seminar). Also after «Fullfør»: the follow-up comes after the
   * conversation. AuditLog has who, the action and the new status, never anything typed. */
  async setStatus(
    interview: string,
    question: string,
    action: string,
    input: FindingStatusInput,
    actor: { audit: string; name: string },
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      // The same lock as a save of the field, so a choice taken away meanwhile is not set again.
      await tx.$queryRaw`SELECT id FROM interview WHERE id = ${interview}::uuid FOR UPDATE`;
      const key = { interview_id: interview, question_id: question, action_id: action };
      const where = { interview_id_question_id_action_id: key };
      if (!(await tx.interviewAction.count({ where: key })))
        throw new NotFoundException('Tiltaket er ikkje valt i denne samtalen.');
      const seminar = input.status === 'open' ? null : (input.seminar ?? null);
      if (seminar && !(await tx.seminar.count({ where: { id: seminar } })))
        throw new NotFoundException('Seminaret finst ikkje.');
      const row = await tx.interviewAction.update({
        where,
        data: {
          closed: input.status === 'closed',
          seminar_id: seminar,
          changed_by: actor.name,
          changed_at: new Date(),
        },
      });
      const status = statusOf(row);
      await tx.auditLog.create({
        data: {
          who: actor.audit,
          what: 'interviews.action.status',
          target: `interview:${interview}`,
          details: { question, action, status, seminar },
        },
      });
      return {
        status,
        seminar,
        changed_by: row.changed_by,
        changed_at: row.changed_at?.toISOString() ?? null,
      };
    });
    // As a finding's status: another admin's client page or seminar page refreshes (acceptance 2.22b).
    this.events.changed('seminars');
    return result;
  }
}

/** How many conversations a client has, for the check before a client is deleted. */
export function interviewCountForClient(
  db: Prisma.TransactionClient,
  client: string,
): Promise<number> {
  return db.interview.count({ where: { client_id: client } });
}
