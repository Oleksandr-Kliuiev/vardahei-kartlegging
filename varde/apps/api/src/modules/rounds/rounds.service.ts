import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { CodesService, deadlineExpiry } from './codes.js';

export interface NewRound { name: string; template_version_id: string }
export interface NewRoundClient { client_id: string; population_snapshot: number; deadline: string }

@Injectable()
export class RoundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: CodesService,
    private readonly metrics: MetricsService,
  ) {}

  private async audit(tx: Prisma.TransactionClient, who: string, action: string, target: string) {
    await tx.auditLog.create({ data: { who, what: `rounds.${action}`, target } });
  }

  private async published(tx: Prisma.TransactionClient, id: string) {
    const version = await tx.templateVersion.findUnique({ where: { id } });
    if (version?.status !== 'published') throw new BadRequestException('Vel ein publisert versjon.');
    return version;
  }

  private async lockRound(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM round WHERE id = ${id}::uuid FOR UPDATE`;
    const round = await tx.round.findUnique({ where: { id } });
    if (round === null) throw new NotFoundException('Runden finst ikkje.');
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
    return this.prisma.$transaction(async (tx) => {
      await this.published(tx, input.template_version_id);
      const round = await tx.round.create({ data: { ...input, type: 'regular' } });
      await this.audit(tx, who, 'create', `round:${round.id}`);
      return round;
    });
  }

  setVersion(id: string, version: string, who: string) {
    return this.prisma.$transaction(async (tx) => {
      const round = await this.lockRound(tx, id);
      if (round.status !== 'draft') throw new ConflictException('Runden er allereie opna.');
      await this.published(tx, version);
      const updated = await tx.round.update({ where: { id }, data: { template_version_id: version } });
      await this.audit(tx, who, 'version', `round:${id}`);
      return updated;
    });
  }

  addClient(id: string, input: NewRoundClient, who: string) {
    return this.prisma.$transaction(async (tx) => {
      const round = await this.lockRound(tx, id);
      if (!['draft', 'open'].includes(round.status)) throw new ConflictException('Runden er avslutta.');
      if (!(await tx.client.findUnique({ where: { id: input.client_id } }))) throw new NotFoundException('Kunden finst ikkje.');
      if (await tx.roundClient.findUnique({ where: { round_id_client_id: { round_id: id, client_id: input.client_id } } }))
        throw new ConflictException('Kunden er allereie med i runden.');
      const rc = await tx.roundClient.create({ data: { ...input, round_id: id, deadline: new Date(input.deadline) } });
      await this.audit(tx, who, 'client.add', `round_client:${rc.id}`);
      return rc;
    });
  }

  openClient(id: string, who: string) {
    return this.prisma.$transaction(async (tx) => {
      const { rc, round } = await this.lockClient(tx, id);
      if (rc.status !== 'draft' || !['draft', 'open'].includes(round.status))
        throw new ConflictException('Kartlegginga kan ikkje opnast.');
      if (rc.deadline === null || deadlineExpiry(rc.deadline) <= new Date())
        throw new BadRequestException('Vel ein frist fram i tid.');
      if (round.template_version_id === null) throw new BadRequestException('Vel ein versjon.');
      const version = await this.published(tx, round.template_version_id);
      if (round.status === 'draft') await tx.round.update({ where: { id: round.id }, data: {
        status: 'open', identification: version.identification, opened_at: new Date(),
      } });
      await tx.roundClient.update({ where: { id }, data: { status: 'open' } });
      const issued = await this.codes.issue(tx, id, who);
      await this.audit(tx, who, 'client.open', `round_client:${id}`);
      return issued;
    });
  }

  closeClient(id: string, who: string) {
    return this.prisma.$transaction(async (tx) => {
      const { rc } = await this.lockClient(tx, id);
      if (rc.status !== 'open') throw new ConflictException('Kartlegginga er ikkje open.');
      const updated = await tx.roundClient.update({ where: { id }, data: { status: 'closed' } });
      await this.audit(tx, who, 'client.close', `round_client:${id}`);
      return updated;
    });
  }

  setDeadline(id: string, deadline: string, who: string) {
    return this.prisma.$transaction(async (tx) => {
      const { rc, round } = await this.lockClient(tx, id);
      if (!['draft', 'open'].includes(rc.status) || !['draft', 'open'].includes(round.status))
        throw new ConflictException('Kartlegginga er avslutta.');
      const day = new Date(deadline);
      const updated = await tx.roundClient.update({ where: { id }, data: {
        deadline: day, code_expires_at: rc.code_hash === null ? null : deadlineExpiry(day),
      } });
      await this.audit(tx, who, 'client.deadline', `round_client:${id}`);
      return updated;
    });
  }

  reissue(id: string, who: string) {
    return this.prisma.$transaction(async (tx) => {
      const { rc, round } = await this.lockClient(tx, id);
      if (rc.status !== 'open' || round.status !== 'open') throw new ConflictException('Kartlegginga er ikkje open.');
      return this.codes.issue(tx, id, who);
    });
  }

  async close(id: string, who: string) {
    await this.prisma.$transaction(async (tx) => {
      const round = await this.lockRound(tx, id);
      if (!['open', 'closed'].includes(round.status)) throw new ConflictException('Runden er ikkje open.');
      // Repeating close retries a failed release; committed snapshots remain protected by privacy.
      if (round.status === 'open') {
        await tx.roundClient.updateMany({ where: { round_id: id }, data: { status: 'closed' } });
        await tx.round.update({ where: { id }, data: { status: 'closed', closed_at: new Date() } });
        await this.audit(tx, who, 'close', `round:${id}`);
      }
    });
    return this.metrics.releaseRound(id, { type: 'auto', who: 'system' });
  }

  async release(id: string, who: string) {
    const round = await this.prisma.round.findUnique({ where: { id } });
    if (round === null) throw new NotFoundException('Runden finst ikkje.');
    if (!['open', 'closed'].includes(round.status)) throw new ConflictException('Runden er ikkje opna.');
    const result = await this.metrics.releaseRound(id, { type: 'manual', who });
    await this.audit(this.prisma, who, 'release', `round:${id}`);
    return result;
  }
}
