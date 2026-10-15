import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TemplateContent } from '@varde/schema/template/template';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ViewCell } from '../privacy/privacy.service.js';
import { canonical } from '../surveys/hashes.js';
import { type Channel, FindingRule, type FindingView } from './finding-rule.js';
import { evaluate } from './evaluate.js';
import { byLevel } from './leader-rules.js';

const CLOSED = ['closed', 'archived'];
export interface RuleRound {
  id: string;
  status: string;
}
/** A release of one scope: `all` or the client id. */
export interface ReleaseScope {
  id: string;
  scope: string;
}
type Db = Pick<Prisma.TransactionClient, 'findingRule'>;
interface Numbers {
  n: number;
  count: number;
  share: number;
  level: 'medium' | 'high';
}
const split = (k: string): [string, number] => {
  const at = k.lastIndexOf('@');
  return [k.slice(0, at), Number(k.slice(at + 1))];
};

@Injectable()
export class FindingsService {
  constructor(private readonly prisma: PrismaService) {}
  /** Seed versions are immutable; versions made in the editor (newer numbers) stay untouched. */
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
  /** The latest version of every rule of a template family (open rounds and the editor). */
  async rules(family: string, channel: Channel) {
    const found = await this.prisma.findingRule.findMany({
      where: { key: { startsWith: `${family}.` }, channel },
      orderBy: [{ key: 'asc' }, { version: 'asc' }],
    });
    const latest = new Map<string, FindingRule>();
    for (const r of found) latest.set(r.key, FindingRule.parse(r.definition));
    return [...latest.values()].sort((a, b) => a.order - b.order);
  }
  /** Rules at the given `key@version`, limited to a family and channel. */
  private async at(db: Db, keys: readonly string[], family: string, channel: Channel) {
    const pairs = keys.map(split).filter(([key]) => key.startsWith(`${family}.`));
    if (!pairs.length) return [];
    const found = await db.findingRule.findMany({
      where: { channel, OR: pairs.map(([key, version]) => ({ key, version })) },
    });
    return found.map((r) => FindingRule.parse(r.definition)).sort((a, b) => a.order - b.order);
  }
  /**
   * Rules of a view (2.5): the latest versions while the round is open. A closed round uses the
   * versions its release was computed with: the given release and scope, else the round's latest.
   */
  async rulesFor(round: RuleRound, family: string, channel: Channel, release?: ReleaseScope) {
    if (!CLOSED.includes(round.status)) return this.rules(family, channel);
    const set = release
      ? await this.prisma.findingSet.findUnique({
          where: { release_id_scope: { release_id: release.id, scope: release.scope } },
        })
      : await this.prisma.findingSet.findFirst({
          where: { round_id: round.id },
          orderBy: [{ computed_at: 'desc' }, { release_id: 'asc' }],
        });
    return set ? this.at(this.prisma, set.rule_keys, family, channel) : this.rules(family, channel);
  }
  async calculate(
    round: RuleRound,
    content: TemplateContent,
    cells: readonly ViewCell[],
    group: string,
    channel: Channel,
    release?: ReleaseScope,
  ) {
    const rules = await this.rulesFor(round, content.key, channel, release);
    return evaluate(rules, cells, content, group, channel);
  }
  /**
   * Aggregate findings of a closed round's current release for one scope (2.5). Computed once with
   * the rules in effect at that moment and saved, one row per rule; afterwards read back from the
   * rows (the smallest version where history left several), never recalculated by a newer version.
   */
  async released(
    round: RuleRound,
    client: { id: string } | undefined,
    content: TemplateContent,
    cells: readonly ViewCell[],
  ): Promise<{ findings: FindingView[]; release?: ReleaseScope }> {
    const id = cells.flatMap((c) => (c.suppressed || !c.release_id ? [] : [c.release_id]))[0];
    if (!id) return { findings: [] };
    const release = { id, scope: client?.id ?? 'all' };
    const findings = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`finding:${round.id}:${release.scope}`},0))`;
      const where = { round_id: round.id, client_id: client?.id ?? null, release_id: id };
      const set = await tx.findingSet.findUnique({
        where: { release_id_scope: { release_id: id, scope: release.scope } },
      });
      if (!set) {
        const latest = await tx.findingRule.groupBy({ by: ['key'], _max: { version: true } });
        const keys = latest.map((l) => `${l.key}@${l._max.version ?? 1}`).sort();
        const rules = await this.at(tx, keys, content.key, 'aggregate');
        const out = evaluate(rules, cells, content, 'all', 'aggregate');
        for (const f of out) {
          if (f.release_id !== id)
            throw new Error('a saved finding belongs to the release it reads');
          if (!(await tx.finding.findFirst({ where: { ...where, rule_key: f.key } })))
            await tx.finding.create({
              data: {
                ...where,
                rule_key: f.key,
                rule_version: f.version,
                numbers: { n: f.n, count: f.count, share: f.share, level: f.level },
              },
            });
        }
        await tx.findingSet.create({
          data: { release_id: id, scope: release.scope, round_id: round.id, rule_keys: keys },
        });
        return out;
      }
      const rows = await tx.finding.findMany({
        where,
        orderBy: [{ rule_key: 'asc' }, { rule_version: 'asc' }],
      });
      const saved = new Map<string, (typeof rows)[number]>();
      for (const r of rows) if (!saved.has(r.rule_key)) saved.set(r.rule_key, r);
      const rules = await this.at(
        tx,
        [...saved.values()].map((r) => `${r.rule_key}@${r.rule_version}`),
        content.key,
        'aggregate',
      );
      // Texts of computed rules are rendered from the same version and the same released cells.
      const shown = new Map(
        evaluate(rules, cells, content, 'all', 'aggregate').map((f) => [f.key, f]),
      );
      return rules.map((r): FindingView => {
        const n = saved.get(r.key)!.numbers as unknown as Numbers;
        return {
          key: r.key,
          version: r.version,
          channel: 'aggregate',
          n: n.n,
          count: n.count,
          // The stored JSON share may differ in the last digit; a simple rule's share is count / n.
          share: !r.computed && n.n ? n.count / n.n : n.share,
          level: n.level,
          text: shown.get(r.key)?.text ?? r.text.nn,
          action: r.action_text.nn,
          severity: r.severity,
          tal: shown.get(r.key)?.tal ?? `${n.count} av ${n.n}`,
          release_id: id,
          order: r.order,
        };
      });
    });
    return { findings: findings.sort(byLevel), release };
  }
}
