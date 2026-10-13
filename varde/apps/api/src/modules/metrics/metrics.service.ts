// Metrics of a round into released snapshots (1.10, ADR-020, ADR-021): definitions from
// config/seed/metrics (seedMetrics, idempotent by key+version), cells computed inside privacy
// for every population, one release per population with the full metric set of the round.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { subMetrics } from '@varde/rules/findings';
import {
  type MetricDefinition,
  MetricDefinitionSet,
  MetricDefinition as MetricSchema,
} from '@varde/schema/metrics/metric-definition';
import { POPULATIONS } from '@varde/schema/metrics/populations';
import { PrismaService } from '../../prisma/prisma.service.js';
import { canonical } from '../surveys/hashes.js';
import {
  type ComputedCell,
  PrivacyService,
  type ReleaseActor,
} from '../privacy/privacy.service.js';

export interface RoundRelease {
  round: string;
  populations: Record<string, { cells: number; carried: number }>;
}

@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly privacy: PrivacyService,
  ) {}

  async seedMetrics(seedDir: string): Promise<{ created: number; unchanged: number }> {
    const dir = join(seedDir, 'metrics');
    const out = { created: 0, unchanged: 0 };
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()) {
      // Files are keyed by metric key: { "<key>": { version, kind, … } } (config/seed/metrics).
      const byKey = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<string, object>;
      const defs = MetricDefinitionSet.parse(
        Object.entries(byKey).map(([key, rest]) => ({ key, ...rest })),
      );
      for (const def of defs) {
        const found = await this.prisma.metricDefinition.findUnique({
          where: { key_version: { key: def.key, version: def.version } },
        });
        if (found === null) {
          await this.prisma.metricDefinition.create({
            data: {
              key: def.key,
              version: def.version,
              definition: def,
            },
          });
          out.created += 1;
        } else if (canonical(found.definition) !== canonical(def)) {
          throw new Error(
            `metric ${def.key}@${def.version} exists with another definition (versions are immutable)`,
          );
        } else out.unchanged += 1;
      }
    }
    return out;
  }

  /** Definitions of the round's template (key prefix `<template>.`). */
  async definitionsFor(round: string): Promise<MetricDefinition[]> {
    const r = await this.prisma.round.findUniqueOrThrow({
      where: { id: round },
      include: { template_version: { include: { template: true } } },
    });
    const key = r.template_version?.template.key;
    if (key === undefined) throw new Error(`round ${round} has no template version`);
    const rows = await this.prisma.metricDefinition.findMany({
      where: { key: { startsWith: `${key}.` } },
      orderBy: [{ key: 'asc' }, { version: 'asc' }],
    });
    return rows.map((x) => MetricSchema.parse(x.definition));
  }

  async releaseRound(round: string, actor: ReleaseActor): Promise<RoundRelease> {
    const defs = await this.definitionsFor(round);
    const metricSet = [...new Set(defs.flatMap(subMetrics))];
    const clients = await this.prisma.roundClient.findMany({
      where: { round_id: round },
      include: { client: true },
      orderBy: { client: { slug: 'asc' } },
    });
    const out: RoundRelease = { round, populations: {} };
    for (const population of POPULATIONS) {
      let cells: ComputedCell[] = [];
      if (population === 'round_client') {
        for (const rc of clients)
          cells = cells.concat(
            await this.privacy.computeCells(round, population, defs, rc.client.slug),
          );
      } else cells = await this.privacy.computeCells(round, population, defs);
      const r = await this.privacy.release(round, population, cells, 'db', actor, {
        metric_set: metricSet,
      });
      out.populations[population] = { cells: r.released.length, carried: r.carried };
    }
    return out;
  }

  /** `rounds close --imported`: rounds of ok manifests → closed, then their snapshots (auto). */
  async closeImported(seedDir: string): Promise<RoundRelease[]> {
    await this.seedMetrics(seedDir);
    const manifests = await this.prisma.importManifest.findMany({ where: { status: 'ok' } });
    const ids = [...new Set(manifests.flatMap((m) => m.round_ids))];
    const out: RoundRelease[] = [];
    for (const id of ids) {
      const r = await this.prisma.round.findUniqueOrThrow({ where: { id } });
      if (r.status !== 'closed' || r.closed_at === null) {
        await this.prisma.round.update({
          where: { id },
          data: { status: 'closed', closed_at: r.closed_at ?? new Date() },
        });
      }
      out.push(await this.releaseRound(id, { type: 'auto', who: 'system' }));
    }
    return out;
  }
}
