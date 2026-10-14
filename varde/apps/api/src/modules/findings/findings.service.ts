import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import type { TemplateContent } from '@varde/schema/template/template';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ViewCell } from '../privacy/privacy.service.js';
import { canonical } from '../surveys/hashes.js';
import { FindingRule, type FindingView } from './finding-rule.js';
import { evaluate } from './evaluate.js';

@Injectable()
export class FindingsService {
  constructor(private readonly prisma: PrismaService) {}
  async seed(seedDir: string) {
    const out = { created: 0, unchanged: 0 };
    for (const file of readdirSync(join(seedDir, 'findings'))
      .filter((f) => f.endsWith('.json'))
      .sort()) {
      const rules = FindingRule.array().parse(
        JSON.parse(readFileSync(join(seedDir, 'findings', file), 'utf8')),
      );
      for (const rule of rules) {
        const found = await this.prisma.findingRule.findUnique({
          where: { key_version: { key: rule.key, version: rule.version } },
        });
        if (!found) {
          await this.prisma.findingRule.create({
            data: { key: rule.key, version: rule.version, channel: rule.channel, definition: rule },
          });
          out.created++;
        } else if (canonical(found.definition) !== canonical(rule))
          throw new Error(`finding rule ${rule.key}@${rule.version} is immutable`);
        else out.unchanged++;
      }
    }
    return out;
  }
  async rules(family: string, channel: 'aggregate' | 'leader') {
    const found = await this.prisma.findingRule.findMany({
      where: { key: { startsWith: `${family}.` }, channel },
      orderBy: [{ key: 'asc' }, { version: 'asc' }],
    });
    const latest = new Map<string, FindingRule>();
    for (const r of found) latest.set(r.key, FindingRule.parse(r.definition));
    return [...latest.values()].sort((a, b) => a.order - b.order);
  }
  async calculate(
    content: TemplateContent,
    cells: readonly ViewCell[],
    group: string,
    channel: 'aggregate' | 'leader',
  ) {
    return evaluate(await this.rules(content.key, channel), cells, content, group, channel);
  }
  /** Persist aggregate findings for a closed round, linked to the cells' release, never leader. */
  async persist(round: string, client: string | undefined, findings: readonly FindingView[]) {
    const id = client
      ? (await this.prisma.client.findUniqueOrThrow({ where: { slug: client } })).id
      : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`finding:${round}:${client ?? 'all'}`},0))`;
      for (const f of findings) {
        if (f.channel !== 'aggregate' || !f.release_id)
          throw new Error('only aggregate released findings can be persisted');
        const where = {
          round_id: round,
          client_id: id,
          rule_key: f.key,
          rule_version: f.version,
          release_id: f.release_id,
        };
        if (!(await tx.finding.findFirst({ where })))
          await tx.finding.create({
            data: { ...where, numbers: { n: f.n, count: f.count, share: f.share, level: f.level } },
          });
      }
    });
  }
}
