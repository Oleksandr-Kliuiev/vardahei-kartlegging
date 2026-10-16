// What a live poll looks like right now (3.4–3.6): the snapshot for the admin panel and the big
// screen, and the phone's view of the open question. Reads states and texts; the only numbers come
// from PrivacyService.live («N har svart», and the result of a shown question with k).
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TemplateContent } from '@varde/schema/template/template';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EventsService } from '../events/events.service.js';
import { PrivacyService } from '../privacy/privacy.service.js';
import { qrSvg } from '../rounds/poster.js';
import { publicOrigin } from '../seminars/seminars.service.js';
import { whenText } from '../seminars/when.js';
import { liveQuestions, participantQuestion } from './live-template.js';
import type { LiveCurrent, LiveSnapshot, LiveState, ParticipantLive } from './live-types.js';

type Db = PrismaService | Prisma.TransactionClient;
const include = {
  template_version: true,
  round_clients: { select: { code: true } },
  seminars_live: {
    select: { id: true, topic_nn: true, topic_en: true, starts_at: true, ends_at: true },
  },
  live_questions: { orderBy: { position: 'asc' } },
} as const;
type LiveRound = Prisma.RoundGetPayload<{ include: typeof include }>;

/** The question that leads now: the open one, else the one changed last, else none. */
export function currentQuestion<T extends { state: string; changed_at: Date; position: number }>(
  states: readonly T[],
): T | null {
  const open = states.find((s) => s.state === 'open');
  if (open) return open;
  const started = states.filter((s) => s.state !== 'waiting');
  if (!started.length) return null;
  return started.reduce((a, b) =>
    b.changed_at > a.changed_at || (+b.changed_at === +a.changed_at && b.position > a.position)
      ? b
      : a,
  );
}

/** The phone's state: a question is open, none has been asked, between two, or all are done. */
export function participantState(states: readonly { state: string }[]): ParticipantLive['state'] {
  if (states.some((s) => s.state === 'open')) return 'open';
  if (states.every((s) => s.state === 'waiting')) return 'waiting';
  return states.some((s) => s.state === 'waiting') ? 'between' : 'done';
}

const PHONE_CACHE_MS = 1000;

@Injectable()
export class LiveView {
  private readonly qr = new Map<string, string>();
  private readonly phones = new Map<string, { at: number; value: ParticipantLive }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly privacy: PrivacyService,
    events: EventsService,
  ) {
    // A change reaches the phones at their next poll, not a second later.
    events.onLive((round) => this.phones.delete(round));
  }

  async round(id: string, db: Db = this.prisma): Promise<LiveRound> {
    const r = await db.round.findUnique({ where: { id }, include });
    if (!r || r.type !== 'live' || !r.template_version)
      throw new NotFoundException('Live-spørsmåla finst ikkje.');
    return r;
  }

  private link(r: LiveRound): { link: string | null; qr: string | null } {
    const code = r.round_clients[0]?.code;
    const origin = publicOrigin();
    if (!code || !origin) return { link: null, qr: null };
    const link = `${origin.origin}/r?c=${code}`;
    let svg = this.qr.get(link);
    if (svg === undefined) {
      svg = qrSvg(link);
      this.qr.clear();
      this.qr.set(link, svg);
    }
    return { link, qr: svg };
  }

  async snapshot(id: string, db: Db = this.prisma): Promise<LiveSnapshot> {
    const r = await this.round(id, db);
    const content = r.template_version!.content as unknown as TemplateContent;
    const questions = liveQuestions(content);
    const seminar = r.seminars_live[0];
    const byId = new Map(questions.map((q) => [q.id, q]));
    const summaries = r.live_questions.map((s) => ({
      id: s.question_id,
      no: s.position,
      state: s.state as LiveState,
      text: byId.get(s.question_id)?.texts.text ?? { nn: s.question_id },
    }));
    const lead = currentQuestion(r.live_questions);
    let current: LiveCurrent | null = null;
    if (lead) {
      const q = byId.get(lead.question_id);
      const options = (q?.options ?? []).map((o) => ({ id: o.id, text: o.texts.text }));
      current = {
        ...summaries.find((s) => s.id === lead.question_id)!,
        multi: q?.type === 'multi',
        options,
        // Only while it is asked: a shown question has its result (and below k no number at all).
        answered:
          lead.state === 'released'
            ? null
            : await this.privacy.live.answered(db, r.id, lead.question_id),
        result: await this.privacy.live.released(
          db,
          r.id,
          lead.question_id,
          options.map((o) => o.id),
        ),
      };
    }
    const latest = r.live_questions.reduce(
      (a, s) => (s.changed_at > a ? s.changed_at : a),
      r.created_at,
    );
    return {
      round: r.id,
      seminar: seminar
        ? {
            id: seminar.id,
            topic: { nn: seminar.topic_nn, ...(seminar.topic_en ? { en: seminar.topic_en } : {}) },
            when: whenText(seminar.starts_at, seminar.ends_at, 'nn'),
          }
        : { id: '', topic: { nn: r.name }, when: '' },
      languages: r.template_version!.required_languages,
      ...this.link(r),
      total: summaries.length,
      questions: summaries,
      current,
      at: latest.toISOString(),
    };
  }

  /** The phone (3.6): only the open question, in the version's languages; cached a second per
   * poll, so a hall of phones polling every few seconds costs one read a second. */
  async participant(round: string, now = Date.now()): Promise<ParticipantLive> {
    const hit = this.phones.get(round);
    if (hit && now - hit.at < PHONE_CACHE_MS) return hit.value;
    const r = await this.round(round);
    const content = r.template_version!.content as unknown as TemplateContent;
    const languages = r.template_version!.required_languages;
    const seminar = r.seminars_live[0];
    const topic = seminar
      ? { nn: seminar.topic_nn, ...(seminar.topic_en ? { en: seminar.topic_en } : {}) }
      : { nn: r.name };
    const state = participantState(r.live_questions);
    let value: ParticipantLive = { state: state === 'open' ? 'waiting' : state, languages, topic };
    const open = r.live_questions.find((s) => s.state === 'open');
    const q = open && liveQuestions(content).find((x) => x.id === open.question_id);
    if (open && q)
      value = {
        state: 'open',
        languages,
        topic,
        ...participantQuestion(q, languages, open.position, r.live_questions.length),
      };
    this.phones.set(round, { at: now, value });
    return value;
  }
}
