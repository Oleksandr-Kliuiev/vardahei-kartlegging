// What «Samtalar» gives out of the conversations (2.21): the overview of one or more rounds, its CSV and
// the referat (A4) of one conversation. Admins only, like everything of the data class `samtale`. The
// internal notes («Eige notat», the note of the whole conversation) are never read here, so they reach
// neither the overview, the CSV nor the referat. AuditLog has every export and every referat read: who,
// which conversation or rounds, how many; never what was typed.
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Rating } from './interview-input.js';
import { overviewCsv, overviewOf, type RoundRow } from './interview-overview.js';
import { countRatings, guideQuestions } from './interview-view.js';
import type { Actor } from './interviews.service.js';

const day = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10));

@Injectable()
export class InterviewReportService {
  constructor(private readonly prisma: PrismaService) {}

  /** The chosen rounds with every conversation, its client and its answers (without notes). */
  private async load(ids: readonly string[]): Promise<RoundRow[]> {
    const wanted = [...new Set(ids)];
    const rounds = await this.prisma.interviewRound.findMany({
      where: { id: { in: wanted } },
      include: {
        template_version: { select: { id: true, label: true, content: true } },
        interviews: {
          select: {
            id: true,
            status: true,
            held_on: true,
            client: { select: { id: true, name: true } },
            answers: { select: { question_id: true, rating: true, answer: true, action: true } },
          },
        },
      },
    });
    if (rounds.length !== wanted.length) throw new NotFoundException('Samtalerunda finst ikkje.');
    return rounds.map(({ interviews, ...r }) => ({ ...r, conversations: interviews }));
  }

  async overview(ids: readonly string[], inProgress: boolean) {
    return overviewOf(await this.load(ids), inProgress);
  }

  /** The CSV of the overview's choice, without notes; AuditLog counts what went out. */
  async exportCsv(ids: readonly string[], inProgress: boolean, actor: Actor) {
    const rounds = await this.load(ids);
    const out = overviewCsv(rounds, inProgress);
    await this.prisma.auditLog.create({
      data: {
        who: actor.audit,
        what: 'interviews.export',
        target: rounds.length === 1 ? `interview_round:${rounds[0]!.id}` : null,
        details: {
          rounds: rounds.map((r) => r.id),
          in_progress: inProgress,
          conversations: out.conversations,
          rows: out.rows,
        },
      },
    });
    return out.text;
  }

  /** The referat of one conversation for the client (A4): who took part, the counts, the overall
   * impression, what was agreed and every question with what the client said, the rating and the
   * conclusion. Never a note. Every read is in AuditLog. */
  async referat(id: string, actor: Actor) {
    const i = await this.prisma.interview.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        held_on: true,
        done_at: true,
        interviewees: true,
        interviewers: true,
        summary: true,
        agreed: true,
        client: { select: { id: true, name: true } },
        round: {
          select: { id: true, name: true, template_version: { select: { content: true } } },
        },
        answers: { select: { question_id: true, rating: true, answer: true, action: true } },
      },
    });
    if (i === null) throw new NotFoundException('Samtalen finst ikkje.');
    if (i.status === 'planned') throw new ConflictException('Samtalen er ikkje starta enno.');
    await this.prisma.auditLog.create({
      data: {
        who: actor.audit,
        what: 'interviews.referat',
        target: `interview:${id}`,
        details: { client: i.client.id, status: i.status },
      },
    });
    const questions = guideQuestions(i.round.template_version.content);
    const byId = new Map(i.answers.map((a) => [a.question_id, a]));
    return {
      id: i.id,
      status: i.status,
      held_on: day(i.held_on),
      done_at: i.done_at,
      client: i.client,
      round: { id: i.round.id, name: i.round.name },
      interviewees: i.interviewees,
      interviewers: i.interviewers,
      summary: i.summary,
      agreed: i.agreed,
      counts: countRatings(questions, i.answers),
      questions: questions.map((q, n) => {
        const a = byId.get(q.id);
        return {
          id: q.id,
          no: n + 1,
          short: q.short,
          section: q.section,
          answer: a?.answer ?? '',
          rating: (a?.rating ?? null) as Rating | null,
          action: a?.action ?? '',
        };
      }),
    };
  }
}
