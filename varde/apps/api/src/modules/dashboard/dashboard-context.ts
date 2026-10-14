import { Injectable, NotFoundException } from '@nestjs/common';
import type { TemplateContent } from '@varde/schema/template/template';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MetricsService } from '../metrics/metrics.service.js';

@Injectable()
export class DashboardContext {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}
  async previous(scope: DashboardScope) {
    const candidates = await this.prisma.round.findMany({
      where: {
        id: { not: scope.round.id },
        identification: 'initials',
        created_at: { lt: scope.round.created_at },
        template_version: { template: { key: scope.content.key } },
      },
      include: { template_version: true },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
    const anchors = (content: TemplateContent) =>
      content.questions
        .filter((q) => q.part === 'common' && q.anchor_key)
        .map((q) => q.anchor_key)
        .sort()
        .join('|');
    const match = candidates.find(
      (r) =>
        anchors(r.template_version!.content as unknown as TemplateContent) ===
        anchors(scope.content),
    );
    return match ? this.load(match.id) : undefined;
  }
  async load(round: string, client?: string) {
    const r = await this.prisma.round.findUnique({
      where: { id: round },
      include: {
        template_version: true,
        round_clients: { include: { client: true } },
      },
    });
    if (!r?.template_version) throw new NotFoundException('Runden finst ikkje.');
    const selected =
      client && client !== 'alle'
        ? r.round_clients.find((rc) => rc.client_id === client || rc.client.slug === client)
        : undefined;
    if (client && client !== 'alle' && !selected)
      throw new NotFoundException('Kunden er ikkje med i runden.');
    return {
      round: r,
      content: r.template_version.content as unknown as TemplateContent,
      defs: await this.metrics.definitionsFor(round),
      client: selected?.client.slug,
      clients: r.round_clients.map((rc) => rc.client).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
}
export type DashboardScope = Awaited<ReturnType<DashboardContext['load']>>;
