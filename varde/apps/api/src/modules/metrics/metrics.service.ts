// Metrics of a round into released snapshots (1.10, ADR-020, ADR-021): definitions from
// config/seed/metrics (seedMetrics, idempotent by key+version), cells computed inside privacy
// for every population, one release per population with the full metric set of the round.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FindingsService } from '../findings/findings.service.js';
import type { TemplateContent } from '@varde/schema/template/template';
import { Injectable } from '@nestjs/common';
import { subMetrics } from '@varde/rules/findings';
import {
  type MetricDefinition,
  MetricDefinitionSet,
  MetricDefinition as MetricSchema,
} from '@varde/schema/metrics/metric-definition';
import { POPULATIONS } from '@varde/schema/metrics/populations';
import { PrismaService } from '../../prisma/prisma.service.js';
import { editorMetricPrefix } from '../surveys/editor-metrics.js';
import { canonical } from '../surveys/hashes.js';
import { type ReferenceVersion, referenceOf, sameMeaning } from './same-meaning.js';
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
    private readonly findings: FindingsService,
  ) {}

  async seedMetrics(seedDir: string): Promise<{ created: number; unchanged: number }> {
    await this.findings.seed(seedDir);
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

  /**
   * Definitions of the round's version. A seeded version reads the template's definitions (key
   * prefix `<template>.`). A version published in the workshop (1d, 2.16) has distributions of its
   * own and keeps every template definition whose questions mean what they meant (`sameMeaning`),
   * so zones, findings and the comparison with round 1 go on after a spelling fix; other questions
   * are counted by their own distribution, one series per question (ADR-005, ADR-020). A round that
   * was released keeps the set it was released with (rule 4 of 1.4c).
   */
  async definitionsFor(round: string): Promise<MetricDefinition[]> {
    const r = await this.prisma.round.findUniqueOrThrow({
      where: { id: round },
      include: { template_version: { include: { template: true } } },
    });
    const version = r.template_version;
    if (!version) throw new Error(`round ${round} has no template version`);
    const generated = await this.prisma.metricDefinition.findMany({
      where: { key: { startsWith: editorMetricPrefix(version.id) } },
    });
    const authoredSet = await this.prisma.auditLog.findFirst({
      where: { what: 'surveys.editor_metrics', target: `template_version:${version.id}` },
      select: { id: true },
    });
    const rows = await this.prisma.metricDefinition.findMany({
      where: { key: { startsWith: `${version.template.key}.` } },
      orderBy: [{ key: 'asc' }, { version: 'asc' }],
    });
    const seeded = rows.map((x) => MetricSchema.parse(x.definition));
    if (!generated.length && !authoredSet) return seeded;
    const own = generated.map((x) => MetricSchema.parse(x.definition));
    const fixed = await this.prisma.roundMetricSet.findUnique({ where: { round_id: round } });
    if (fixed) {
      const set = new Set(fixed.metric_keys);
      return [...seeded, ...own].filter((d) => {
        const metrics = subMetrics(d);
        return metrics.length > 0 && metrics.every((m) => set.has(m));
      });
    }
    const holds = seeded.length
      ? sameMeaning(
          version.content as unknown as TemplateContent,
          await this.referenceVersions(version.template_id),
        )
      : () => false;
    const kept = seeded.filter(holds);
    // One distribution per series: the template's own where it still holds, the version's elsewhere.
    const covered = new Set(
      kept.filter((d) => d.kind === 'distribution').map((d) => d.questions[0]?.key),
    );
    return [...kept, ...own.filter((d) => !covered.has(d.questions[0]?.key))];
  }

  /**
   * The template's own definitions as a version reads them (2.18, «Brukt i» in the workshop): which
   * questions each one reads, and whether it holds for the version as saved — the rule of
   * definitionsFor, applied to a draft before it is published.
   */
  async templateUses(versionId: string) {
    const v = await this.prisma.templateVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: { template: true },
    });
    const rows = await this.prisma.metricDefinition.findMany({
      where: { key: { startsWith: `${v.template.key}.` } },
      orderBy: [{ key: 'asc' }, { version: 'asc' }],
    });
    if (!rows.length) return [];
    const holds = sameMeaning(
      v.content as unknown as TemplateContent,
      await this.referenceVersions(v.template_id),
    );
    return rows.map((x) => {
      const def = MetricSchema.parse(x.definition);
      return {
        key: def.key,
        kind: def.kind,
        part: def.part,
        questions: [...new Set(def.questions.map((q) => q.key.split('.')[0]!))],
        holds: holds(def),
      };
    });
  }

  /** The template's published versions made outside the workshop, by template; a published
   * version never changes, so the list is read again only when another version is published. */
  private readonly reference = new Map<string, { ids: string; versions: ReferenceVersion[] }>();
  private async referenceVersions(template: string): Promise<ReferenceVersion[]> {
    const published = await this.prisma.templateVersion.findMany({
      where: { template_id: template, status: 'published' },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const ids = published.map((v) => v.id).join(',');
    const hit = this.reference.get(template);
    if (hit?.ids === ids) return hit.versions;
    const audited = await this.prisma.auditLog.findMany({
      where: {
        what: 'surveys.editor_metrics',
        target: { in: published.map((v) => `template_version:${v.id}`) },
      },
      select: { target: true },
    });
    const generated = published.length
      ? await this.prisma.metricDefinition.findMany({
          where: { OR: published.map((v) => ({ key: { startsWith: editorMetricPrefix(v.id) } })) },
          select: { key: true },
        })
      : [];
    const editor = new Set([
      ...audited.map((a) => a.target?.slice('template_version:'.length)),
      ...published
        .filter((v) => generated.some((g) => g.key.startsWith(editorMetricPrefix(v.id))))
        .map((v) => v.id),
    ]);
    const rows = await this.prisma.templateVersion.findMany({
      where: { id: { in: published.filter((v) => !editor.has(v.id)).map((v) => v.id) } },
      select: { content: true },
    });
    const versions = rows.map((v) => referenceOf(v.content as unknown as TemplateContent));
    this.reference.set(template, { ids, versions });
    return versions;
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
    const ids: Partial<Record<string, string>> = {};
    for (const population of POPULATIONS) {
      let cells: ComputedCell[] = [];
      let cross: ComputedCell[] | undefined;
      if (population === 'round_client') {
        for (const rc of clients)
          cells = cells.concat(
            await this.privacy.computeCells(round, population, defs, rc.client.slug),
          );
      } else if (population === 'all_clients')
        ({ cells, cross } = await this.privacy.allClientsCells(round, defs));
      else cells = await this.privacy.computeCells(round, population, defs);
      const r = await this.privacy.release(round, population, cells, 'db', actor, {
        metric_set: metricSet,
        ...(cross === undefined ? {} : { cross }),
      });
      out.populations[population] = { cells: r.released.length, carried: r.carried };
      ids[population] = r.release_id;
    }
    const r = await this.prisma.round.findUniqueOrThrow({
      where: { id: round },
      include: { template_version: true },
    });
    // The findings of a new release are computed once, with the rules in effect now, and saved.
    if (r.status === 'closed' || r.status === 'archived') {
      const content = r.template_version!.content as unknown as TemplateContent;
      for (const client of [undefined, ...clients.map((rc) => rc.client)]) {
        const common = defs.filter((d) => d.part === 'common');
        // A client's findings go to its own report: they are read from its own cells.
        const cells = client
          ? await this.privacy.ownCells(round, client.slug, common)
          : await this.privacy.viewCells(round, 'all_clients', common);
        // The release id also pins the versions when every cell of the scope is hidden.
        const id = ids[client ? 'round_client' : 'all_clients'];
        await this.findings.released(r, client, content, cells, id);
      }
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
