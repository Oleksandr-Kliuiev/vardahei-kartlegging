// Rounds of a seminar (3.8, ARCHITECTURE §7: «Seminar … ссылается на раунды before/live/after»):
// «Før» — an ordinary survey of the seminar's clients (type regular, e.g. the current round),
// «Live» — the live poll (3.4), «Etter» — a survey after the seminar (type post_seminar), launched
// by the round wizard with the seminar (RoundsService.launch) or linked here. Before and after
// share at least one client with the seminar; every change of a link is in AuditLog. The database
// checks the types too (trigger seminar_round_before_after_type). No counts here: the card reads
// the progress of each round (privacy, as «Rundar» does) and the live panel.
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EventsService } from '../events/events.service.js';

export type RoundSlot = 'before' | 'after';
const COLUMN = { before: 'round_before_id', after: 'round_after_id' } as const;
const TYPE = { before: 'regular', after: 'post_seminar' } as const;

/** Why a round cannot be «Før» or «Etter» (nynorsk, shown in the admin). */
export const REFUSAL = {
  before: 'Vel ei vanleg undersøking hos kundane som «Før».',
  after: 'Vel ei undersøking etter seminaret som «Etter», eller start ei ny.',
  draft: 'Undersøkinga er ikkje opna enno. Vel ei som er open eller avslutta.',
  noClients: 'Seminaret har ingen kundar. Vel kundane på seminaret først.',
  noShared: 'Ingen av kundane på seminaret er med i denne undersøkinga.',
  taken: 'Undersøkinga høyrer alt til eit anna seminar.',
} as const;

const roundInclude = {
  template_version: { select: { label: true, template: { select: { key: true } } } },
  round_clients: {
    select: {
      id: true,
      client_id: true,
      status: true,
      population_snapshot: true,
      deadline: true,
      client: { select: { name: true } },
    },
    orderBy: { client: { name: 'asc' } },
  },
} as const;
type RoundRow = Prisma.RoundGetPayload<{ include: typeof roundInclude }>;

/** One step of the card: the round, and its clients that are on the seminar (others counted). */
function step(r: RoundRow, own: ReadonlySet<string>) {
  const mine = r.round_clients.filter((rc) => own.has(rc.client_id));
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    status: r.status,
    template: r.template_version
      ? `${r.template_version.template.key} · ${r.template_version.label}`
      : null,
    opened_at: r.opened_at?.toISOString() ?? null,
    closed_at: r.closed_at?.toISOString() ?? null,
    round_clients: mine.map((rc) => ({
      id: rc.id,
      client_id: rc.client_id,
      name: rc.client.name,
      status: rc.status,
      population: rc.population_snapshot,
      deadline: rc.deadline?.toISOString().slice(0, 10) ?? null,
    })),
    others: r.round_clients.length - mine.length,
  };
}
export type SeminarRoundStep = ReturnType<typeof step>;

@Injectable()
export class SeminarRoundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  private async seminar(db: PrismaService | Prisma.TransactionClient, id: string) {
    const s = await db.seminar.findUnique({
      where: { id },
      include: { clients: { select: { client_id: true, client: { select: { kind: true } } } } },
    });
    if (!s) throw new NotFoundException('Seminaret finst ikkje.');
    // Customers only: the technical client of live polls (3.4) is never one of them.
    const own = new Set(
      s.clients.filter((c) => c.client.kind === 'client').map((c) => c.client_id),
    );
    return { s, own };
  }

  private async round(id: string | null, own: ReadonlySet<string>) {
    if (id === null) return null;
    const r = await this.prisma.round.findUnique({ where: { id }, include: roundInclude });
    return r ? step(r, own) : null;
  }

  /** The card «Rundar»: before, live and after with their state, and what can be linked. */
  async card(id: string) {
    const { s, own } = await this.seminar(this.prisma, id);
    const live = s.round_live_id
      ? await this.prisma.round.findUnique({
          where: { id: s.round_live_id },
          select: { id: true, status: true },
        })
      : null;
    const candidates = own.size
      ? await this.prisma.round.findMany({
          where: {
            type: { in: ['regular', 'post_seminar'] },
            round_clients: { some: { client_id: { in: [...own] } } },
          },
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            round_clients: { select: { client_id: true } },
            seminars_after: { select: { id: true } },
          },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        })
      : [];
    const choice = (r: (typeof candidates)[number]) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      shared: r.round_clients.filter((rc) => own.has(rc.client_id)).length,
    });
    const versions = await this.prisma.templateVersion.findMany({
      where: {
        status: 'published',
        template: { audience: { in: ['client_survey', 'seminar_after'] } },
      },
      select: { id: true, label: true, template: { select: { key: true } } },
      orderBy: [{ template: { key: 'asc' } }, { version_no: 'desc' }],
    });
    return {
      before: await this.round(s.round_before_id, own),
      live,
      after: await this.round(s.round_after_id, own),
      choices: {
        before: candidates.filter((r) => r.type === 'regular' && r.status !== 'draft').map(choice),
        after: candidates
          .filter(
            (r) =>
              r.type === 'post_seminar' &&
              r.seminars_after.every((x) => x.id === id) &&
              r.id !== s.round_after_id,
          )
          .map(choice),
      },
      versions,
    };
  }

  /** Prisma errors may carry arguments; none of them reaches the logger. The only unique index a
   * link can hit is «one seminar per Etter» (seminar_round_after_once): two seminars linking the
   * same survey at once both pass the check, and the second insert into the index fails — 409. */
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
        throw new ConflictException(REFUSAL.taken);
      throw new ServiceUnavailableException('Koplinga kunne ikkje lagrast. Prøv igjen.');
    }
  }

  /** Links (or with `round = null` unlinks) «Før» or «Etter»; AuditLog with the previous link. */
  async link(id: string, slot: RoundSlot, round: string | null, who: string) {
    const changed = await this.guarded(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM seminar WHERE id = ${id}::uuid FOR UPDATE`;
        const { s, own } = await this.seminar(tx, id);
        const previous = s[COLUMN[slot]];
        if (previous === round) return false;
        if (round !== null) await this.check(tx, id, slot, round, own);
        await tx.seminar.update({
          where: { id },
          data: slot === 'before' ? { round_before_id: round } : { round_after_id: round },
        });
        await tx.auditLog.create({
          data: {
            who,
            what: `seminars.rounds.${slot}`,
            target: `seminar:${id}`,
            details: { round, previous },
          },
        });
        return true;
      }),
    );
    if (changed) {
      this.events.changed('seminars');
      this.events.changed('responses');
    }
    return { ok: true, changed };
  }

  private async check(
    tx: Prisma.TransactionClient,
    seminar: string,
    slot: RoundSlot,
    id: string,
    own: ReadonlySet<string>,
  ) {
    await tx.$queryRaw`SELECT id FROM round WHERE id = ${id}::uuid FOR SHARE`;
    const r = await tx.round.findUnique({
      where: { id },
      include: { round_clients: { select: { client_id: true } } },
    });
    if (!r) throw new NotFoundException('Runden finst ikkje.');
    if (r.type !== TYPE[slot]) throw new BadRequestException(REFUSAL[slot]);
    if (slot === 'before' && r.status === 'draft') throw new BadRequestException(REFUSAL.draft);
    if (own.size === 0) throw new BadRequestException(REFUSAL.noClients);
    if (!r.round_clients.some((rc) => own.has(rc.client_id)))
      throw new BadRequestException(REFUSAL.noShared);
    if (
      slot === 'after' &&
      (await tx.seminar.count({ where: { round_after_id: id, id: { not: seminar } } }))
    )
      throw new ConflictException(REFUSAL.taken);
  }
}
