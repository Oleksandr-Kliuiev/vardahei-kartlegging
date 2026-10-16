import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { EventsService } from '../events/events.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { CodesService, deadlineExpiry } from './codes.js';

/** A seminar live poll is led from its seminar (3.4), never through the round admin. */
const LIVE_ROUND = 'Live-spørsmåla blir styrte frå seminaret.';
/** The technical client of live polls (3.4) takes part in no survey. */
const NOT_A_CUSTOMER = 'Vel ein av kundane.';

export interface NewRound {
  name: string;
  template_version_id: string;
}
export interface NewRoundClient {
  client_id: string;
  population_snapshot?: number | null | undefined;
  deadline: string;
}

@Injectable()
export class RoundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: CodesService,
    private readonly metrics: MetricsService,
    private readonly events: EventsService,
  ) {}

  private async changed<T>(operation: Promise<T>): Promise<T> {
    const result = await operation;
    this.events.changed('rounds');
    this.events.changed('progress');
    return result;
  }

  private async audit(tx: Prisma.TransactionClient, who: string, action: string, target: string) {
    await tx.auditLog.create({ data: { who, what: `rounds.${action}`, target } });
  }

  private async published(tx: Prisma.TransactionClient, id: string) {
    const version = await tx.templateVersion.findUnique({ where: { id } });
    if (version?.status !== 'published')
      throw new BadRequestException('Vel ein publisert versjon.');
    return version;
  }

  private async lockRound(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM round WHERE id = ${id}::uuid FOR UPDATE`;
    const round = await tx.round.findUnique({ where: { id } });
    if (round === null) throw new NotFoundException('Runden finst ikkje.');
    if (round.type === 'live') throw new ConflictException(LIVE_ROUND);
    return round;
  }

  private async lockClient(tx: Prisma.TransactionClient, id: string) {
    const found = await tx.roundClient.findUnique({ where: { id } });
    if (found === null) throw new NotFoundException('Kartlegginga finst ikkje.');
    const round = await this.lockRound(tx, found.round_id);
    await tx.$queryRaw`SELECT id FROM round_client WHERE id = ${id}::uuid FOR UPDATE`;
    const rc = await tx.roundClient.findUniqueOrThrow({ where: { id } });
    return { round, rc };
  }

  create(input: NewRound, who: string) {
    return this.changed(
      this.prisma.$transaction(async (tx) => {
        await this.published(tx, input.template_version_id);
        const round = await tx.round.create({ data: { ...input, type: 'regular' } });
        await this.audit(tx, who, 'create', `round:${round.id}`);
        return round;
      }),
    );
  }

  /** 3.8: a survey after a seminar is for clients of the seminar, from a version made for
   * clients, and the seminar has no «Etter» yet (the seminar row stays locked until commit). */
  private async afterSeminar(
    tx: Prisma.TransactionClient,
    seminar: string,
    template: string,
    clients: readonly NewRoundClient[],
  ) {
    await tx.$queryRaw`SELECT id FROM seminar WHERE id = ${seminar}::uuid FOR UPDATE`;
    const s = await tx.seminar.findUnique({
      where: { id: seminar },
      include: { clients: { select: { client_id: true } } },
    });
    if (s === null) throw new NotFoundException('Seminaret finst ikkje.');
    if (s.round_after_id !== null)
      throw new ConflictException('Seminaret har alt ei undersøking etter. Ta bort koplinga først.');
    const own = new Set(s.clients.map((c) => c.client_id));
    if (clients.some((c) => !own.has(c.client_id)))
      throw new BadRequestException('Vel berre kundar som er med på seminaret.');
    const t = await tx.surveyTemplate.findUnique({ where: { id: template } });
    if (t?.audience === 'seminar_live')
      throw new BadRequestException('Vel eit skjema for kundane, ikkje eit for live-spørsmål.');
  }

  async launch(
    input: NewRound & { clients: NewRoundClient[]; open: boolean; seminar?: string | undefined },
    who: string,
  ) {
    const seminar = input.seminar;
    const result = await this.changed(
      this.prisma.$transaction(async (tx) => {
        const version = await this.published(tx, input.template_version_id);
        if (new Set(input.clients.map((c) => c.client_id)).size !== input.clients.length)
          throw new BadRequestException('Vel kvar kunde berre éin gong.');
        if (seminar !== undefined)
          await this.afterSeminar(tx, seminar, version.template_id, input.clients);
        const round = await tx.round.create({
          data: {
            name: input.name,
            template_version_id: version.id,
            type: seminar === undefined ? 'regular' : 'post_seminar',
          },
        });
        const ids: string[] = [];
        for (const item of input.clients) {
          const client = await tx.client.findUnique({ where: { id: item.client_id } });
          if (!client) throw new NotFoundException('Kunden finst ikkje.');
          if (client.kind !== 'client') throw new BadRequestException(NOT_A_CUSTOMER);
          const deadline = new Date(item.deadline);
          if (input.open && deadlineExpiry(deadline) <= new Date())
            throw new BadRequestException('Vel ein frist fram i tid.');
          const rc = await tx.roundClient.create({
            data: {
              round_id: round.id,
              client_id: client.id,
              deadline,
              population_snapshot:
                item.population_snapshot === undefined
                  ? client.employee_count
                  : item.population_snapshot,
            },
          });
          ids.push(rc.id);
          await this.audit(tx, who, 'client.add', `round_client:${rc.id}`);
        }
        if (input.open) {
          await tx.round.update({
            where: { id: round.id },
            data: {
              status: 'open',
              identification: version.identification,
              opened_at: new Date(),
            },
          });
          for (const id of ids) {
            await tx.roundClient.update({ where: { id }, data: { status: 'open' } });
            await this.codes.issue(tx, id, who);
            await this.audit(tx, who, 'client.open', `round_client:${id}`);
          }
        }
        await this.audit(tx, who, 'launch', `round:${round.id}`);
        if (seminar !== undefined) {
          await tx.seminar.update({ where: { id: seminar }, data: { round_after_id: round.id } });
          await tx.auditLog.create({
            data: {
              who,
              what: 'seminars.rounds.after',
              target: `seminar:${seminar}`,
              details: { round: round.id, previous: null, launched: true },
            },
          });
        }
        // Invitation endpoint is the only surface the wizard uses to retrieve bearer links.
        return { id: round.id, round_client_ids: ids, status: input.open ? 'open' : 'draft' };
      }),
    );
    if (seminar !== undefined) {
      this.events.changed('seminars');
      this.events.changed('responses');
    }
    return result;
  }

  setVersion(id: string, version: string, who: string) {
    return this.changed(
      this.prisma.$transaction(async (tx) => {
        const round = await this.lockRound(tx, id);
        if (round.status !== 'draft') throw new ConflictException('Runden er allereie opna.');
        await this.published(tx, version);
        const updated = await tx.round.update({
          where: { id },
          data: { template_version_id: version },
        });
        await this.audit(tx, who, 'version', `round:${id}`);
        return updated;
      }),
    );
  }

  addClient(id: string, input: NewRoundClient, who: string) {
    return this.changed(
      this.prisma.$transaction(async (tx) => {
        const round = await this.lockRound(tx, id);
        if (!['draft', 'open'].includes(round.status))
          throw new ConflictException('Runden er avslutta.');
        const client = await tx.client.findUnique({ where: { id: input.client_id } });
        if (!client) throw new NotFoundException('Kunden finst ikkje.');
        if (client.kind !== 'client') throw new BadRequestException(NOT_A_CUSTOMER);
        if (
          await tx.roundClient.findUnique({
            where: { round_id_client_id: { round_id: id, client_id: input.client_id } },
          })
        )
          throw new ConflictException('Kunden er allereie med i runden.');
        const rc = await tx.roundClient.create({
          data: {
            ...input,
            population_snapshot:
              input.population_snapshot === undefined
                ? client.employee_count
                : input.population_snapshot,
            round_id: id,
            deadline: new Date(input.deadline),
          },
        });
        await this.audit(tx, who, 'client.add', `round_client:${rc.id}`);
        return rc;
      }),
    );
  }

  openClient(id: string, who: string) {
    return this.changed(
      this.prisma.$transaction(async (tx) => {
        const { rc, round } = await this.lockClient(tx, id);
        if (rc.status !== 'draft' || !['draft', 'open'].includes(round.status))
          throw new ConflictException('Kartlegginga kan ikkje opnast.');
        if (rc.deadline === null || deadlineExpiry(rc.deadline) <= new Date())
          throw new BadRequestException('Vel ein frist fram i tid.');
        if (round.template_version_id === null) throw new BadRequestException('Vel ein versjon.');
        const version = await this.published(tx, round.template_version_id);
        if (round.status === 'draft')
          await tx.round.update({
            where: { id: round.id },
            data: {
              status: 'open',
              identification: version.identification,
              opened_at: new Date(),
            },
          });
        await tx.roundClient.update({ where: { id }, data: { status: 'open' } });
        const issued = await this.codes.issue(tx, id, who);
        await this.audit(tx, who, 'client.open', `round_client:${id}`);
        return issued;
      }),
    );
  }

  closeClient(id: string, who: string) {
    return this.changed(
      this.prisma.$transaction(async (tx) => {
        const { rc } = await this.lockClient(tx, id);
        if (rc.status !== 'open') throw new ConflictException('Kartlegginga er ikkje open.');
        const updated = await tx.roundClient.update({ where: { id }, data: { status: 'closed' } });
        await this.audit(tx, who, 'client.close', `round_client:${id}`);
        return updated;
      }),
    );
  }

  setDeadline(id: string, deadline: string, who: string) {
    return this.changed(
      this.prisma.$transaction(async (tx) => {
        const { rc, round } = await this.lockClient(tx, id);
        if (!['draft', 'open'].includes(rc.status) || !['draft', 'open'].includes(round.status))
          throw new ConflictException('Kartlegginga er avslutta.');
        const day = new Date(deadline);
        const updated = await tx.roundClient.update({
          where: { id },
          data: {
            deadline: day,
            code_expires_at: rc.code_hash === null ? null : deadlineExpiry(day),
          },
        });
        await this.audit(tx, who, 'client.deadline', `round_client:${id}`);
        return updated;
      }),
    );
  }

  reissue(id: string, who: string) {
    return this.changed(
      this.prisma.$transaction(async (tx) => {
        const { rc, round } = await this.lockClient(tx, id);
        if (rc.status !== 'open' || round.status !== 'open')
          throw new ConflictException('Kartlegginga er ikkje open.');
        return this.codes.issue(tx, id, who);
      }),
    );
  }

  async close(id: string, who: string) {
    await this.prisma.$transaction(async (tx) => {
      const round = await this.lockRound(tx, id);
      if (!['open', 'closed'].includes(round.status))
        throw new ConflictException('Runden er ikkje open.');
      // Repeating close retries a failed release; committed snapshots remain protected by privacy.
      if (round.status === 'open') {
        await tx.roundClient.updateMany({ where: { round_id: id }, data: { status: 'closed' } });
        await tx.round.update({ where: { id }, data: { status: 'closed', closed_at: new Date() } });
        await this.audit(tx, who, 'close', `round:${id}`);
      }
    });
    this.events.changed('rounds');
    this.events.changed('progress');
    return this.metrics.releaseRound(id, { type: 'auto', who: 'system' });
  }

  async release(id: string, who: string) {
    const round = await this.prisma.round.findUnique({ where: { id } });
    if (round === null) throw new NotFoundException('Runden finst ikkje.');
    if (round.type === 'live') throw new ConflictException(LIVE_ROUND);
    if (!['open', 'closed'].includes(round.status))
      throw new ConflictException('Runden er ikkje opna.');
    const result = await this.metrics.releaseRound(id, { type: 'manual', who });
    await this.audit(this.prisma, who, 'release', `round:${id}`);
    return result;
  }
}
