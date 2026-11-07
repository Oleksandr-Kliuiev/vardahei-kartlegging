// Samtalar (2.20): rounds of conversations with key people and the conversations themselves, filled in
// by Vardahei at the client's table. A conversation is not anonymous (data class `samtale`, ADR-017):
// admins only, never in aggregates, snapshots, the client's channels, the assistant or Atlas.
// Fields are saved one at a time against the value the screen last saw (409 when it changed meanwhile),
// so two screens on one conversation never overwrite each other unseen. AuditLog has the round, the
// start, «Fullfør» and «Opne for endring»; what is typed is not logged.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  AnswerFieldInput,
  InterviewFieldInput,
  RoundInput,
  StartInput,
} from './interview-input.js';
import { actionsValue, saveActions } from './interview-actions.js';
import { countRatings, guideQuestions, guideTitle, score } from './interview-view.js';

type Tx = Prisma.TransactionClient;

/** Who acts: AuditLog keeps the channel id, the rows keep the name people read on the screen. */
export interface Actor {
  audit: string;
  name: string;
}

const DONE = 'Samtalen er fullført. Opne samtalen for endring først.';
const day = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10));

/** The 409 of a field that changed on another screen: what it holds now and who changed it. */
function changed(current: string | null, by: string | null | undefined, at: Date | undefined) {
  return new ConflictException({
    statusCode: 409,
    message: by
      ? `${by} har endra dette feltet sidan du opna det.`
      : 'Feltet er endra på ein annan skjerm sidan du opna det.',
    current,
    updated_by: by ?? null,
    updated_at: at ?? null,
  });
}

@Injectable()
export class InterviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Published conversation guides, newest first: what a new round can use. */
  async guides() {
    const rows = await this.prisma.templateVersion.findMany({
      where: { status: 'published', template: { audience: 'interview' } },
      orderBy: { published_at: 'desc' },
      select: { id: true, label: true, version_no: true, published_at: true, content: true },
    });
    return rows.map(({ content, ...v }) => ({
      ...v,
      title: guideTitle(content),
      question_count: guideQuestions(content).length,
    }));
  }

  async rounds() {
    const rounds = await this.prisma.interviewRound.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        template_version: { select: { id: true, label: true, content: true } },
        interviews: { select: { status: true } },
      },
    });
    return rounds.map((r) => {
      const n = (s: string) => r.interviews.filter((i) => i.status === s).length;
      return {
        id: r.id,
        name: r.name,
        status: r.status,
        created_at: r.created_at,
        guide: {
          id: r.template_version.id,
          label: r.template_version.label,
          title: guideTitle(r.template_version.content),
        },
        counts: {
          planned: n('planned'),
          in_progress: n('in_progress'),
          done: n('done'),
          total: r.interviews.length,
        },
      };
    });
  }

  async createRound(input: RoundInput, actor: Actor) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const version = await tx.templateVersion.findUnique({
          where: { id: input.template_version_id },
          include: { template: { select: { audience: true } } },
        });
        if (version?.status !== 'published' || version.template.audience !== 'interview')
          throw new BadRequestException('Vel ein publisert samtaleguide.');
        const clients = [...new Set(input.clients)];
        await this.requireClients(tx, clients);
        const round = await tx.interviewRound.create({
          data: {
            name: input.name,
            template_version_id: version.id,
            created_by: actor.audit,
            interviews: { create: clients.map((client_id) => ({ client_id })) },
          },
        });
        await tx.auditLog.create({
          data: {
            who: actor.audit,
            what: 'interviews.round.create',
            target: `interview_round:${round.id}`,
            details: { guide: version.id, clients: clients.length },
          },
        });
        return { id: round.id };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Det finst alt ei samtalerunde med dette namnet.');
      throw error;
    }
  }

  /** More clients for an open round; a client already in it is left as it is. */
  async addClients(id: string, clients: readonly string[], actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM interview_round WHERE id = ${id}::uuid FOR UPDATE`;
      const round = await tx.interviewRound.findUnique({
        where: { id },
        include: { interviews: { select: { client_id: true } } },
      });
      if (round === null) throw new NotFoundException('Samtalerunda finst ikkje.');
      if (round.status !== 'open') throw new ConflictException('Samtalerunda er avslutta.');
      const known = new Set(round.interviews.map((i) => i.client_id));
      const added = [...new Set(clients)].filter((c) => !known.has(c));
      await this.requireClients(tx, added);
      await tx.interview.createMany({
        data: added.map((client_id) => ({ interview_round_id: id, client_id })),
      });
      await tx.auditLog.create({
        data: {
          who: actor.audit,
          what: 'interviews.round.clients',
          target: `interview_round:${id}`,
          details: { added: added.length },
        },
      });
      return { added: added.length };
    });
  }

  async round(id: string) {
    const r = await this.prisma.interviewRound.findUnique({
      where: { id },
      include: {
        template_version: { select: { id: true, label: true, content: true } },
        interviews: {
          include: {
            client: { select: { id: true, name: true } },
            answers: { select: { question_id: true, rating: true } },
          },
        },
      },
    });
    if (r === null) throw new NotFoundException('Samtalerunda finst ikkje.');
    const questions = guideQuestions(r.template_version.content);
    return {
      id: r.id,
      name: r.name,
      status: r.status,
      guide: {
        id: r.template_version.id,
        label: r.template_version.label,
        title: guideTitle(r.template_version.content),
        question_count: questions.length,
      },
      interviews: r.interviews
        .map((i) => {
          const counts = countRatings(questions, i.answers);
          return {
            id: i.id,
            client: i.client,
            status: i.status,
            held_on: day(i.held_on),
            interviewees: i.interviewees,
            // Who from Vardahei was there: the start dialog offers these names as boxes to tick.
            interviewers: i.interviewers,
            done_at: i.done_at,
            updated_at: i.updated_at,
            counts,
            score: score(counts),
          };
        })
        .sort((a, b) => a.client.name.localeCompare(b.client.name, 'nn')),
    };
  }

  /** One conversation with its guide and every answer so far. */
  async get(id: string) {
    const i = await this.prisma.interview.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true } },
        round: { include: { template_version: { select: { label: true, content: true } } } },
        answers: { include: { actions: { select: { action_id: true } } } },
      },
    });
    if (i === null) throw new NotFoundException('Samtalen finst ikkje.');
    const content = i.round.template_version.content;
    return {
      id: i.id,
      status: i.status,
      held_on: day(i.held_on),
      interviewees: i.interviewees,
      interviewers: i.interviewers,
      summary: i.summary,
      agreed: i.agreed,
      note: i.note,
      started_at: i.started_at,
      done_at: i.done_at,
      done_by: i.done_by,
      updated_at: i.updated_at,
      updated_by: i.updated_by,
      client: i.client,
      round: { id: i.round.id, name: i.round.name },
      guide: {
        title: guideTitle(content),
        label: i.round.template_version.label,
        questions: guideQuestions(content),
      },
      answers: Object.fromEntries(
        i.answers.map((a) => [
          a.question_id,
          {
            answer: a.answer,
            rating: a.rating,
            action: a.action,
            actions: actionsValue(a.actions),
            note: a.note,
            updated_at: a.updated_at,
            updated_by: a.updated_by,
          },
        ]),
      ),
    };
  }

  /** «Start samtalen»: who sits at the table and when. Later the same call corrects them. */
  async start(id: string, input: StartInput, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const i = await this.lock(tx, id);
      if (i.status === 'done') throw new ConflictException(DONE);
      const now = new Date();
      await tx.interview.update({
        where: { id },
        data: {
          status: 'in_progress',
          held_on: new Date(`${input.held_on}T00:00:00Z`),
          interviewees: input.interviewees.map((p) => (p.name ? p : { role: p.role })),
          interviewers: input.interviewers,
          started_at: i.started_at ?? now,
          updated_at: now,
          updated_by: actor.name,
        },
      });
      if (i.status === 'planned')
        await tx.auditLog.create({
          data: {
            who: actor.audit,
            what: 'interviews.start',
            target: `interview:${id}`,
            details: { round: i.interview_round_id, client: i.client_id },
          },
        });
      return { id };
    });
  }

  /** One field of one answer, saved only while it still holds what the screen last saw. */
  async saveAnswer(id: string, question: string, input: AnswerFieldInput, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const i = await this.writable(tx, id);
      const round = await tx.interviewRound.findUniqueOrThrow({
        where: { id: i.interview_round_id },
        select: { template_version: { select: { content: true } } },
      });
      if (!guideQuestions(round.template_version.content).some((q) => q.id === question))
        throw new NotFoundException('Spørsmålet finst ikkje i samtaleguiden.');
      const key = { interview_id: id, question_id: question };
      const row = await tx.interviewAnswer.findUnique({
        where: { interview_id_question_id: key },
        include: { actions: { select: { action_id: true } } },
      });
      const current =
        input.field === 'rating'
          ? (row?.rating ?? null)
          : input.field === 'actions'
            ? actionsValue(row?.actions ?? [])
            : (row?.[input.field] ?? '');
      if (current !== input.expect) throw changed(current, row?.updated_by, row?.updated_at);
      // The actions of the catalogue (2.22b) are rows of their own; the rest is a column of the answer.
      if (input.field === 'actions') return saveActions(tx, key, input.value, actor.name);
      const now = new Date();
      const data = { [input.field]: input.value, updated_at: now, updated_by: actor.name };
      await tx.interviewAnswer.upsert({
        where: { interview_id_question_id: key },
        create: { ...key, ...data, updated_by: actor.name },
        update: data,
      });
      await tx.interview.update({ where: { id }, data: { updated_at: now } });
      return { value: input.value, updated_at: now };
    });
  }

  /** «Samla inntrykk», «Avtalt vidare» or the internal note of the whole conversation. */
  async saveField(id: string, input: InterviewFieldInput, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const i = await this.writable(tx, id);
      if (i[input.field] !== input.expect)
        throw changed(i[input.field], i.updated_by, i.updated_at);
      const now = new Date();
      await tx.interview.update({
        where: { id },
        data: { [input.field]: input.value, updated_at: now, updated_by: actor.name },
      });
      return { value: input.value, updated_at: now };
    });
  }

  /** «Fullfør samtalen»: the conversation counts in the overview and is locked until reopened. */
  async done(id: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const i = await this.lock(tx, id);
      if (i.status === 'done') throw new ConflictException('Samtalen er alt fullført.');
      if (i.status === 'planned') throw new ConflictException('Start samtalen først.');
      const round = await tx.interviewRound.findUniqueOrThrow({
        where: { id: i.interview_round_id },
        select: { template_version: { select: { content: true } } },
      });
      const answers = await tx.interviewAnswer.findMany({
        where: { interview_id: id },
        select: { question_id: true, rating: true },
      });
      const counts = countRatings(guideQuestions(round.template_version.content), answers);
      const now = new Date();
      await tx.interview.update({
        where: { id },
        data: { status: 'done', done_at: now, done_by: actor.name, updated_at: now },
      });
      await tx.auditLog.create({
        data: {
          who: actor.audit,
          what: 'interviews.done',
          target: `interview:${id}`,
          details: { client: i.client_id, unrated: counts.none },
        },
      });
      return { done_at: now };
    });
  }

  /** «Opne for endring»: a finished conversation can be changed again; AuditLog says who opened it. */
  async reopen(id: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const i = await this.lock(tx, id);
      if (i.status !== 'done') throw new ConflictException('Samtalen er ikkje fullført.');
      await tx.interview.update({
        where: { id },
        data: { status: 'in_progress', done_at: null, done_by: null, updated_at: new Date() },
      });
      await tx.auditLog.create({
        data: {
          who: actor.audit,
          what: 'interviews.reopen',
          target: `interview:${id}`,
          details: { client: i.client_id },
        },
      });
      return { id };
    });
  }

  /** The conversations of one client (the client page): newest round first. */
  async ofClient(clientId: string) {
    const rows = await this.prisma.interview.findMany({
      where: { client_id: clientId },
      orderBy: { round: { created_at: 'desc' } },
      include: {
        round: { include: { template_version: { select: { content: true } } } },
        answers: { select: { question_id: true, rating: true } },
      },
    });
    return rows.map((i) => {
      const counts = countRatings(guideQuestions(i.round.template_version.content), i.answers);
      return {
        id: i.id,
        status: i.status,
        held_on: day(i.held_on),
        done_at: i.done_at,
        round: { id: i.round.id, name: i.round.name },
        counts,
        score: score(counts),
      };
    });
  }

  private async lock(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM interview WHERE id = ${id}::uuid FOR UPDATE`;
    const i = await tx.interview.findUnique({ where: { id } });
    if (i === null) throw new NotFoundException('Samtalen finst ikkje.');
    return i;
  }

  /** A conversation that is started and not finished. */
  private async writable(tx: Tx, id: string) {
    const i = await this.lock(tx, id);
    if (i.status === 'planned') throw new ConflictException('Start samtalen før du skriv.');
    if (i.status === 'done') throw new ConflictException(DONE);
    return i;
  }

  private async requireClients(tx: Tx, ids: readonly string[]) {
    if (ids.length === 0) return;
    const found = await tx.client.count({ where: { id: { in: [...ids] }, kind: 'client' } });
    if (found !== ids.length) throw new BadRequestException('Vel berre kundar som finst i Varde.');
  }
}
