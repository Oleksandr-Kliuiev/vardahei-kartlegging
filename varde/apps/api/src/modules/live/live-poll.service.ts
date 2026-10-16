// The live poll of a seminar (3.4, ADR-022): a round of type `live` with one RoundClient for the
// whole seminar (the technical client `seminar`, one link and code for everybody, no split by
// company) and the state of each question, led by the server:
//   waiting → open → closed → released; closed → open again until the result is shown.
// An open question takes answers, a closed one refuses them (responses/live-answer.ts); a result
// is shown only after the question is closed, and `released` is final, so the screen never shows
// a number that a later answer could change (decision 3b: reopening only before «Vis»). One
// question is open at a time. Every step is in AuditLog (who: an admin, or `presenter:<key id>`).
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { TemplateVersionContent } from '@varde/schema/template/validate';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EventsService } from '../events/events.service.js';
import { PrivacyService } from '../privacy/privacy.service.js';
import { CodesService } from '../rounds/codes.js';
import { liveProblem, liveQuestions } from './live-template.js';
import type { LiveAction, LiveState } from './live-types.js';
import { PresenterTokenService } from './presenter-token.service.js';
import { presenterWindow } from './window.js';

/** The one technical client of live rounds (Client.kind = seminar), made on first use. */
export const SEMINAR_CLIENT = { slug: 'varde-seminar-live', name: 'Seminar (live)' } as const;

const STEP: Record<LiveAction, { from: readonly LiveState[]; to: LiveState }> = {
  open: { from: ['waiting', 'closed'], to: 'open' },
  close: { from: ['open'], to: 'closed' },
  release: { from: ['closed'], to: 'released' },
};

/** Why a step cannot be taken (nynorsk, shown to the presenter). */
function refusal(action: LiveAction, state: LiveState): string {
  if (action === 'open') return 'Resultatet er vist, så spørsmålet kan ikkje opnast igjen.';
  if (action === 'close') return 'Spørsmålet er ikkje ope.';
  return state === 'open'
    ? 'Steng spørsmålet før du viser resultatet.'
    : 'Spørsmålet er ikkje stilt enno.';
}

/** The next state, `same` for a repeated step (a double click), or a refusal. */
export function nextState(
  action: LiveAction,
  state: LiveState,
): LiveState | 'same' | { refused: string } {
  const step = STEP[action];
  if (state === step.to) return 'same';
  return step.from.includes(state) ? step.to : { refused: refusal(action, state) };
}

@Injectable()
export class LivePollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly privacy: PrivacyService,
    private readonly codes: CodesService,
    private readonly events: EventsService,
    private readonly keys: PresenterTokenService,
  ) {}

  /** Prisma errors can carry the arguments (the code): none of them reaches the logger. */
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Live-spørsmåla kunne ikkje lagrast. Prøv igjen.');
    }
  }

  private async seminarClient(tx: Prisma.TransactionClient) {
    const client = await tx.client.upsert({
      where: { slug: SEMINAR_CLIENT.slug },
      create: { ...SEMINAR_CLIENT, kind: 'seminar' },
      update: {},
    });
    if (client.kind !== 'seminar')
      throw new ConflictException('Den tekniske seminarkunden manglar.');
    return client;
  }

  /** «Lag live-spørsmål»: a published version made for the seminar day becomes the poll. */
  async create(seminar: string, version: string, who: string, now = new Date()) {
    const round = await this.guarded(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM seminar WHERE id = ${seminar}::uuid FOR UPDATE`;
        const s = await tx.seminar.findUnique({ where: { id: seminar } });
        if (!s) throw new NotFoundException('Seminaret finst ikkje.');
        if (s.round_live_id !== null)
          throw new ConflictException('Seminaret har alt live-spørsmål.');
        const w = presenterWindow(s);
        if (now >= w.to) throw new BadRequestException('Seminaret er over.');
        const v = await tx.templateVersion.findUnique({ where: { id: version } });
        if (v?.status !== 'published') throw new BadRequestException('Vel ein publisert versjon.');
        const parsed = TemplateVersionContent.safeParse(v.content);
        if (!parsed.success) throw new BadRequestException('Versjonen er ikkje gyldig.');
        const problem = liveProblem(parsed.data);
        if (problem) throw new BadRequestException(problem);
        const client = await this.seminarClient(tx);
        const r = await tx.round.create({
          data: {
            name: `Live: ${s.topic_nn}`.slice(0, 200),
            type: 'live',
            template_version_id: v.id,
            identification: 'none',
            status: 'open',
            opened_at: now,
          },
        });
        const rc = await tx.roundClient.create({
          data: { round_id: r.id, client_id: client.id, status: 'open' },
        });
        // One link for the whole hall; it stops working when the presenter key does.
        await this.codes.issue(tx, rc.id, who, w.to);
        const questions = liveQuestions(parsed.data);
        await tx.livePollQuestion.createMany({
          data: questions.map((q, i) => ({ round_id: r.id, question_id: q.id, position: i + 1 })),
        });
        await tx.seminar.update({ where: { id: seminar }, data: { round_live_id: r.id } });
        await tx.auditLog.create({
          data: {
            who,
            what: 'seminars.live.create',
            target: `seminar:${seminar}`,
            details: { round: r.id, version: v.id, questions: questions.length },
          },
        });
        return r.id;
      }),
    );
    this.events.liveChanged(round);
    this.events.changed('seminars');
    return { round };
  }

  /** «Ta bort live-spørsmåla» while nothing has been asked: no question left waiting, so there is
   * no answer either. The link and the presenter key stop with it. */
  async remove(seminar: string, who: string) {
    const round = await this.guarded(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM seminar WHERE id = ${seminar}::uuid FOR UPDATE`;
        const s = await tx.seminar.findUnique({ where: { id: seminar } });
        if (!s) throw new NotFoundException('Seminaret finst ikkje.');
        if (s.round_live_id === null)
          throw new NotFoundException('Seminaret har ingen live-spørsmål.');
        const id = s.round_live_id;
        await tx.$queryRaw`SELECT id FROM round WHERE id = ${id}::uuid FOR UPDATE`;
        if (await tx.livePollQuestion.count({ where: { round_id: id, state: { not: 'waiting' } } }))
          throw new ConflictException('Spørsmåla er i bruk. Dei kan ikkje takast bort no.');
        const rcs = await tx.roundClient.findMany({
          where: { round_id: id },
          select: { id: true },
        });
        for (const rc of rcs)
          if ((await this.privacy.store.count(tx, rc.id)) > 0)
            throw new ConflictException('Spørsmåla har svar. Dei kan ikkje takast bort.');
        await this.keys.revokeAll(tx, seminar, who);
        await tx.seminar.update({ where: { id: seminar }, data: { round_live_id: null } });
        await tx.livePollQuestion.deleteMany({ where: { round_id: id } });
        await tx.roundClient.deleteMany({ where: { round_id: id } });
        await tx.round.delete({ where: { id } });
        await tx.auditLog.create({
          data: {
            who,
            what: 'seminars.live.remove',
            target: `seminar:${seminar}`,
            details: { round: id },
          },
        });
        return id;
      }),
    );
    this.events.liveChanged(round);
    this.events.changed('seminars');
    return { ok: true };
  }

  /** One step of one question (admin or presenter), under the round lock that submissions share. */
  async step(round: string, question: string, action: LiveAction, who: string) {
    const changed = await this.guarded(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM round WHERE id = ${round}::uuid FOR UPDATE`;
        const r = await tx.round.findUnique({ where: { id: round } });
        if (!r || r.type !== 'live') throw new NotFoundException('Live-spørsmåla finst ikkje.');
        if (r.status !== 'open') throw new ConflictException('Live-spørsmåla er avslutta.');
        const q = await tx.livePollQuestion.findUnique({
          where: { round_id_question_id: { round_id: round, question_id: question } },
        });
        if (!q) throw new NotFoundException('Spørsmålet finst ikkje.');
        const next = nextState(action, q.state as LiveState);
        if (next === 'same') return false;
        if (typeof next === 'object') throw new ConflictException(next.refused);
        if (next === 'open') {
          const other = await tx.livePollQuestion.findFirst({
            where: { round_id: round, state: 'open' },
          });
          if (other)
            throw new ConflictException(
              `Spørsmål ${other.position} er ope. Steng det før du opnar eit nytt.`,
            );
        }
        const now = new Date();
        await tx.livePollQuestion.update({
          where: { round_id_question_id: { round_id: round, question_id: question } },
          data: {
            state: next,
            changed_at: now,
            ...(next === 'open'
              ? { opened_at: now }
              : next === 'closed'
                ? { closed_at: now }
                : { released_at: now }),
          },
        });
        await tx.auditLog.create({
          data: {
            who,
            what: `seminars.live.${action}`,
            target: `round:${round}`,
            details: { question, no: q.position },
          },
        });
        return true;
      }),
    );
    if (changed) this.events.liveChanged(round);
    return { changed };
  }
}
