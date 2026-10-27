// The public side of a seminar (3.2, 3.3): what the page `/s?c=<code>` shows, registration and
// the calendar file. No session; the code is a bearer (ADR-009) sent as Authorization, never
// logged. Limits from config/quotas.json as for submissions: registrations per seminar (counted in
// the database under the seminar row lock) and windows per IP and in total (process memory).
// A repeat with the same e-mail gives the same answer as the first time, and the honeypot gets it
// too: nothing tells whether a person is registered. Errors never carry names or e-mail.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { readQuotaConfig } from '../../config/quota-config.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EventsService } from '../events/events.service.js';
import { PrivacyService } from '../privacy/privacy.service.js';
import { SlidingWindow } from '../responses/sliding-window.js';
import { codeHash } from '../rounds/codes.js';
import { CONSENT } from './consent.js';
import { calendarFile } from './ics.js';
import { materialsOf } from './materials.service.js';
import { parseRegistration } from './seminar-input.js';
import { publicOrigin, registrationLink, topicOf } from './seminars.service.js';
import { whenText, type WhenLang } from './when.js';

export const REGISTRATION_QUOTA = 'For mange påmeldingar akkurat no. Prøv igjen om litt.';
const include = { clients: { include: { client: true } } } as const;
type PublicSeminarRow = Prisma.SeminarGetPayload<{ include: typeof include }>;

/** The same answer for a new registration, a repeat and the honeypot. */
const REGISTERED = { registered: true } as const;

const DESCRIPTION: Record<WhenLang, { registered: string; invitation: string }> = {
  nn: {
    registered:
      'Seminar frå Vardahei IT. Etter seminaret finn du lysark og lenkjer på påmeldingssida:',
    invitation: 'Seminar frå Vardahei IT. Meld deg på her:',
  },
  en: {
    registered:
      'Seminar from Vardahei IT. After the seminar, slides and links are on the registration page:',
    invitation: 'Seminar from Vardahei IT. Register here:',
  },
};

/** Calendar file of a seminar: for a person who registered, or to hand out with the invitation. */
export function seminarCalendar(
  s: {
    id: string;
    code: string;
    sequence: number;
    topic_nn: string;
    topic_en: string | null;
    starts_at: Date;
    ends_at: Date;
    place: string;
  },
  lang: WhenLang,
  kind: 'registered' | 'invitation',
  now = new Date(),
): string {
  const link = registrationLink(s.code);
  return calendarFile({
    uid: `seminar-${s.id}@${publicOrigin()?.hostname ?? 'varde'}`,
    sequence: s.sequence,
    stamp: now,
    start: s.starts_at,
    end: s.ends_at,
    summary: topicOf(s, lang),
    location: s.place,
    description: link
      ? `${DESCRIPTION[lang][kind]} ${link}`
      : DESCRIPTION[lang][kind].replace(/:$/, '.'),
    url: link,
  });
}

@Injectable()
export class PublicSeminarService {
  readonly limits = readQuotaConfig();
  private readonly window = new SlidingWindow();
  constructor(
    private readonly prisma: PrismaService,
    private readonly privacy: PrivacyService,
    private readonly events: EventsService,
  ) {}

  /** Unknown, malformed and missing codes are the same 403; a replaced code says so (ADR-009). */
  async resolve(
    code: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<PublicSeminarRow> {
    if (!/^[A-Za-z0-9_-]{22}$/.test(code)) throw new ForbiddenException('Lenkja er ikkje gyldig.');
    const hash = codeHash(code);
    const s = await db.seminar.findUnique({ where: { code_hash: hash }, include });
    if (s) return s;
    if (await db.revokedSeminarCode.findUnique({ where: { code_hash: hash } }))
      throw new ForbiddenException('Lenkja er bytt ut. Spør den som sende deg ho om den nye.');
    throw new ForbiddenException('Lenkja er ikkje gyldig.');
  }

  /** Windows of 10 minutes per IP, per seminar and in total; the IP lives only in process memory. */
  private reserve(ip: string, seminar: string, now: Date): () => void {
    try {
      return this.window.reserve(
        [
          { key: 'seminar:global', max: this.limits.seminar_global_per_10min },
          { key: `seminar:s:${seminar}`, max: this.limits.seminar_per_seminar_per_10min },
          { key: `seminar:ip:${ip}`, max: this.limits.seminar_per_ip_per_10min },
        ],
        now.getTime(),
      );
    } catch {
      throw new HttpException(REGISTRATION_QUOTA, 429);
    }
  }

  async view(code: string, now = new Date()) {
    const s = await this.resolve(code);
    const held = now >= s.ends_at;
    const langs = s.required_languages as WhenLang[];
    const by = <T>(f: (l: WhenLang) => T) =>
      Object.fromEntries(langs.map((l) => [l, f(l)])) as Record<WhenLang, T>;
    return {
      languages: langs,
      topic: by((l) => topicOf(s, l)),
      when: by((l) => whenText(s.starts_at, s.ends_at, l)),
      place: s.place,
      format: s.format,
      // The page picks a company by the client's slug: no ids of the database leave here.
      clients: s.clients
        .map((c) => ({ key: c.client.slug, name: c.client.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'nb')),
      phase: held ? ('held' as const) : ('open' as const),
      consent: held
        ? null
        : {
            version: CONSENT.version,
            invite_version: CONSENT.invite_version,
            ...by((l) => CONSENT[l]),
          },
      // 3.3: the material is for everyone with the link, once the seminar is over.
      materials: held
        ? (await materialsOf(this.prisma, s.id)).map(({ title, url }) => ({ title, url }))
        : [],
    };
  }

  async register(code: string, body: unknown, ip: string, now = new Date()) {
    const input = parseRegistration(body);
    const initial = await this.resolve(code);
    const undo = this.reserve(ip, initial.id, now);
    if (input.website) return REGISTERED;
    let inserted = false;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM seminar WHERE id = ${initial.id}::uuid FOR UPDATE`;
        const s = await this.resolve(code, tx);
        if (now >= s.ends_at) throw new HttpException('Påmeldinga er stengd.', 410);
        if (!s.required_languages.includes(input.lang))
          throw new BadRequestException('Språket er ikkje tilgjengeleg.');
        if (
          input.consent !== CONSENT.version ||
          (input.invite !== undefined && input.invite !== CONSENT.invite_version)
        )
          throw new ConflictException(
            'Teksten om personvern er endra. Last sida på nytt og prøv igjen.',
          );
        const chosen =
          'client' in input.company
            ? s.clients.find((c) => c.client.slug === (input.company as { client: string }).client)
            : undefined;
        if ('client' in input.company && !chosen)
          throw new BadRequestException('Vel bedrift, eller skriv namnet på bedrifta.');
        if (
          (await this.privacy.participants.count(tx, s.id)) >= this.limits.seminar_registrations_max
        )
          throw new HttpException(REGISTRATION_QUOTA, 429);
        inserted = await this.privacy.participants.register(
          tx,
          {
            seminar: s.id,
            name: input.name,
            email: input.email,
            company: chosen ? chosen.client.name : (input.company as { name: string }).name,
            client: chosen ? chosen.client_id : null,
            lang: input.lang,
            consent_version: CONSENT.version,
            invite_version: input.invite === undefined ? null : CONSENT.invite_version,
          },
          now,
        );
      });
    } catch (error) {
      undo();
      if (error instanceof HttpException) throw error;
      // Prisma errors can carry the arguments (name, e-mail): never to the exception logger.
      throw new ServiceUnavailableException('Påmeldinga kom ikkje fram. Prøv igjen om litt.');
    }
    if (inserted) this.events.changed('seminars');
    return REGISTERED;
  }

  async calendar(code: string, lang: string | undefined, now = new Date()) {
    const s = await this.resolve(code);
    const l = (lang && s.required_languages.includes(lang) ? lang : 'nn') as WhenLang;
    return seminarCalendar(s, l, 'registered', now);
  }
}
