// Metrics of a round into released snapshots (1.10, ADR-020, ADR-021): definitions from
// config/seed/metrics (seedMetrics, idempotent by key+version), cells computed inside privacy
// for every population, one release per population with the full metric set of the round.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FindingsService } from '../findings/findings.service.js';
import type { Question } from '@varde/schema/template/question';
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
import { structureOf } from '../surveys/question-structure.js';
import { canonical } from '../surveys/hashes.js';
import {
  type ComputedCell,
  PrivacyService,
  type ReleaseActor,
} from '../privacy/privacy.service.js';

/** A definition holds for a version when every question it reads has the same id, part, anchor and
 * structure there as in a version the template's definitions were made for (ADR-005, ADR-020). */
function meaningKept(content: TemplateContent, reference: ReadonlyMap<string, Question[]>) {
  return (def: MetricDefinition) =>
    def.questions.every((ref) => {
      const q = content.questions.find((x) => x.id === ref.key.split('.')[0]);
      return (
        q !== undefined &&
        q.part === ref.part &&
        (reference.get(q.id) ?? []).some(
          (s) => s.anchor_key === q.anchor_key && structureOf(s) === structureOf(q),
        )
      );
    });
}

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
   * own, and keeps every template definition whose questions kept their meaning — same id, part,
   * anchor and structure as in a version the definitions were made for — so zones, findings and the
   * comparison with round 1 go on after a spelling fix. A question with a new meaning, new answers
   * or new scores leaves those definitions out and is counted by its own distribution (ADR-005,
   * ADR-020); a new metric version would be needed to bring it back into a zone.
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
    const content = version.content as unknown as TemplateContent;
    const holds = seeded.length
      ? meaningKept(content, await this.referenceQuestions(version.template_id))
      : () => false;
    const kept = seeded.filter(holds);
    // One distribution per series: the template's own where it still holds, the version's elsewhere.
    const covered = new Set(
      kept.filter((d) => d.kind === 'distribution').map((d) => d.questions[0]?.key),
    );
    return [
      ...kept,
      ...generated
        .map((x) => MetricSchema.parse(x.definition))
        .filter((d) => !covered.has(d.questions[0]?.key)),
    ];
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
    const holds = meaningKept(
      v.content as unknown as TemplateContent,
      await this.referenceQuestions(v.template_id),
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

  /** Questions of the template's published versions made outside the workshop, by id. */
  private async referenceQuestions(template: string): Promise<Map<string, Question[]>> {
    const versions = await this.prisma.templateVersion.findMany({
      where: { template_id: template, status: 'published' },
      select: { id: true, content: true },
    });
    const editor = new Set(
      (
        await this.prisma.auditLog.findMany({
          where: {
            what: 'surveys.editor_metrics',
            target: { in: versions.map((v) => `template_version:${v.id}`) },
          },
          select: { target: true },
        })
      ).map((a) => a.target?.slice('template_version:'.length)),
    );
    const out = new Map<string, Question[]>();
    for (const v of versions) {
      if (editor.has(v.id)) continue;
      if (
        await this.prisma.metricDefinition.count({
          where: { key: { startsWith: editorMetricPrefix(v.id) } },
        })
      )
        continue;
      for (const q of (v.content as unknown as TemplateContent).questions)
        out.set(q.id, [...(out.get(q.id) ?? []), q]);
    }
    return out;
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
