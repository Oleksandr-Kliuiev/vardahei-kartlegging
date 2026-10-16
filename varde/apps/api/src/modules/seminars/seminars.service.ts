// Seminars for the admin (3.1): list, one seminar, create and change. A seminar carries no
// personal data; its participants are counted (per company, no names) through privacy. Every
// change is in AuditLog, the registration code only as a hash prefix (ADR-009).
import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PrivacyService, type PrivacySession } from '../privacy/privacy.service.js';
import { codeHash, issueCode } from '../rounds/codes.js';
import { materialsOf } from './materials.service.js';
import type { SeminarInput } from './seminar-input.js';
import { osloInstant, osloParts, whenText } from './when.js';

const include = { clients: { include: { client: true } } } as const;
export type SeminarRow = Prisma.SeminarGetPayload<{ include: typeof include }>;

/** Origin of the public pages (PUBLIC_URL); without it no link can be made. */
export function publicOrigin(): URL | null {
  try {
    const u = new URL(process.env.PUBLIC_URL ?? '');
    return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u : null;
  } catch {
    return null;
  }
}
export function registrationLink(code: string): string | null {
  const origin = publicOrigin();
  return origin ? `${origin.origin}/s?c=${code}` : null;
}

/** Topic of the language, nynorsk when there is no English text. */
export const topicOf = (s: { topic_nn: string; topic_en: string | null }, lang: string) =>
  lang === 'en' && s.topic_en ? s.topic_en : s.topic_nn;

@Injectable()
export class SeminarsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly privacy: PrivacyService,
  ) {}

  view(s: SeminarRow, counts = { total: 0, companies: [] as { company: string; n: number }[] }, now = new Date()) {
    const start = osloParts(s.starts_at),
      end = osloParts(s.ends_at);
    return {
      id: s.id,
      topic_nn: s.topic_nn,
      topic_en: s.topic_en,
      date: start.date,
      start: start.time,
      end: end.time,
      when: whenText(s.starts_at, s.ends_at, 'nn'),
      starts_at: s.starts_at.toISOString(),
      ends_at: s.ends_at.toISOString(),
      place: s.place,
      format: s.format,
      languages: s.required_languages,
      clients: s.clients
        .map((c) => ({ id: c.client.id, name: c.client.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'nb')),
      link: registrationLink(s.code),
      status: now < s.ends_at ? ('planned' as const) : ('held' as const),
      registrations: counts,
    };
  }

  async list(now = new Date()) {
    const seminars = await this.prisma.seminar.findMany({ include, orderBy: { starts_at: 'desc' } });
    const counts = await this.privacy.participants.counts(
      this.prisma,
      seminars.map((s) => s.id),
    );
    // Coming seminars first (soonest on top), then those held (latest on top).
    const coming = seminars.filter((s) => now < s.ends_at).reverse(),
      held = seminars.filter((s) => now >= s.ends_at);
    return {
      seminars: [...coming, ...held].map((s) => this.view(s, counts[s.id], now)),
      contacts_to_review: await this.privacy.participants.reviewCount(this.prisma),
    };
  }

  async row(id: string): Promise<SeminarRow> {
    const s = await this.prisma.seminar.findUnique({ where: { id }, include });
    if (!s) throw new NotFoundException('Seminaret finst ikkje.');
    return s;
  }

  async get(id: string, now = new Date()) {
    const s = await this.row(id);
    const counts = await this.privacy.participants.counts(this.prisma, [id]);
    const findings = await this.prisma.findingStatus.findMany({
      where: { seminar_id: id },
      orderBy: { changed_at: 'asc' },
      select: { finding_id: true, status: true, changed_at: true, finding: { select: { rule_key: true, round_id: true, client_id: true } } },
    });
    return {
      ...this.view(s, counts[id], now),
      materials: await materialsOf(this.prisma, id),
      findings: findings.map((f) => ({
        id: f.finding_id,
        status: f.status,
        rule_key: f.finding.rule_key,
        round: f.finding.round_id,
        client: f.finding.client_id,
        changed_at: f.changed_at.toISOString(),
      })),
    };
  }

  /** Names, companies and e-mail of one seminar (class `rows` for seminars: AuditLog). */
  async participants(id: string, session: PrivacySession | undefined) {
    await this.row(id);
    return { rows: await this.privacy.participants.list(this.prisma, id, session) };
  }

  /** Contacts marked by the yearly check (AuditLog). */
  async contactsToReview(session: PrivacySession | undefined) {
    return { rows: await this.privacy.participants.reviewList(this.prisma, session) };
  }

  async confirmContact(contact: string, session: PrivacySession | undefined) {
    if (!(await this.privacy.participants.confirm(this.prisma, contact, session)))
      throw new NotFoundException('Kontakten finst ikkje.');
    return { ok: true };
  }

  private async requireClients(tx: Prisma.TransactionClient, ids: readonly string[]) {
    if ((await tx.client.count({ where: { id: { in: [...ids] } } })) !== ids.length)
      throw new BadRequestException('Ein av kundane finst ikkje.');
  }

  private fields(input: SeminarInput) {
    return {
      topic_nn: input.topic_nn,
      topic_en: input.topic_en,
      starts_at: osloInstant(input.date, input.start),
      ends_at: osloInstant(input.date, input.end),
      place: input.place,
      format: input.format,
      required_languages: input.languages,
    };
  }

  /** Prisma errors may contain the arguments (the code); none of them reaches the logger. */
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Seminaret kunne ikkje lagrast. Prøv igjen.');
    }
  }

  create(input: SeminarInput, who: string): Promise<string> {
    const code = issueCode();
    return this.guarded(() =>
      this.prisma.$transaction(async (tx) => {
        await this.requireClients(tx, input.clients);
        const s = await tx.seminar.create({
          data: {
            ...this.fields(input),
            code,
            code_hash: codeHash(code),
            created_by: who,
            clients: { create: input.clients.map((client_id) => ({ client_id })) },
          },
        });
        await tx.auditLog.create({
          data: {
            who,
            what: 'seminars.create',
            target: `seminar:${s.id}`,
            details: { hash: codeHash(code).slice(0, 12), clients: input.clients.length },
          },
        });
        return s.id;
      }),
    );
  }

  update(id: string, input: SeminarInput, who: string): Promise<string> {
    return this.guarded(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM seminar WHERE id = ${id}::uuid FOR UPDATE`;
        const old = await tx.seminar.findUnique({ where: { id } });
        if (!old) throw new NotFoundException('Seminaret finst ikkje.');
        await this.requireClients(tx, input.clients);
        const next = this.fields(input);
        // A calendar program replaces the event only when the sequence grows (RFC 5545).
        const moved =
          old.starts_at.getTime() !== next.starts_at.getTime() ||
          old.ends_at.getTime() !== next.ends_at.getTime() ||
          old.place !== next.place ||
          old.topic_nn !== next.topic_nn ||
          old.topic_en !== next.topic_en;
        await tx.seminarClient.deleteMany({ where: { seminar_id: id } });
        await tx.seminar.update({
          where: { id },
          data: {
            ...next,
            sequence: moved ? old.sequence + 1 : old.sequence,
            clients: { create: input.clients.map((client_id) => ({ client_id })) },
          },
        });
        await tx.auditLog.create({
          data: { who, what: 'seminars.update', target: `seminar:${id}`, details: { moved } },
        });
        return id;
      }),
    );
  }
}
