// Export and restore of the round archive (5.2, ADR-017/020/021). Export: admin GET, AuditLog
// `exports.archive`. Restore: CLI `archive restore --file`, into an empty migrated database (or
// one that already holds the same parents with the same ids), in one transaction, sha256
// checked first. Snapshots are read and written only by privacy. A repeated restore of the same
// archive is a no-op; a different round with the same id is an explicit error.
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { auditWho } from '../auth/audit-who.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { PrivacyService, type PrivacySession } from '../privacy/privacy.service.js';
import { canonical } from '../surveys/hashes.js';
import {
  ARCHIVE_FORMAT,
  ARCHIVE_VERSION,
  type ArchiveBody,
  ArchiveConflict,
  archiveHash,
  derivedSets,
  releasesOf,
  restorable,
  RoundArchive,
} from './round-archive.js';
import { assertArchivedFindings, assertArchivedSets } from './round-archive-findings.js';

const iso = (d: Date | null) => (d === null ? null : d.toISOString());
const day = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10));
const date = (s: string | null) => (s === null ? null : new Date(`${s}T00:00:00Z`));

@Injectable()
export class RoundArchiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly privacy: PrivacyService,
    private readonly metrics: MetricsService,
  ) {}

  /** The archive of one closed round as stored now, without its hash. */
  async body(round: string): Promise<ArchiveBody> {
    const r = await this.prisma.round.findUnique({
      where: { id: round },
      include: {
        template_version: { include: { template: true } },
        round_clients: { include: { client: true } },
      },
    });
    // A seminar live poll (3.4) is not archived as a survey round, whatever its state.
    if (!r || r.type === 'live') throw new NotFoundException('Runden finst ikkje.');
    const v = r.template_version;
    if (!['closed', 'archived'].includes(r.status) || !v || !r.identification)
      throw new ConflictException('Arkivet kan lagast når runden er avslutta.');
    const family = v.template.key;
    const rules = await this.prisma.findingRule.findMany({
      where: { key: { startsWith: `${family}.` } },
      orderBy: [{ key: 'asc' }, { version: 'asc' }],
    });
    const set = await this.prisma.roundMetricSet.findUnique({ where: { round_id: round } });
    const snapshots = await this.privacy.archiveSnapshots(round);
    const findings = await this.prisma.finding.findMany({
      where: { round_id: round },
      orderBy: { id: 'asc' },
    });
    const sets = await this.prisma.findingSet.findMany({
      where: { round_id: round },
      orderBy: [{ release_id: 'asc' }, { scope: 'asc' }],
    });
    const rcs = [...r.round_clients].sort((a, b) => a.client.slug.localeCompare(b.client.slug));
    const defs = (await this.metrics.definitionsFor(round)).sort(
      (a, b) => a.key.localeCompare(b.key) || a.version - b.version,
    );
    return {
      format: ARCHIVE_FORMAT,
      format_version: ARCHIVE_VERSION,
      exported_at: new Date().toISOString().slice(0, 10),
      round: {
        id: r.id,
        name: r.name,
        type: r.type as RoundArchive['round']['type'],
        status: r.status as RoundArchive['round']['status'],
        identification: r.identification as RoundArchive['round']['identification'],
        created_at: r.created_at.toISOString(),
        opened_at: iso(r.opened_at),
        closed_at: iso(r.closed_at),
        template_version_id: v.id,
      },
      template: {
        id: v.template.id,
        key: family,
        audience: v.template.audience as RoundArchive['template']['audience'],
        required_languages: v.template
          .required_languages as RoundArchive['template']['required_languages'],
      },
      template_version: {
        id: v.id,
        template_id: v.template_id,
        label: v.label,
        version_no: v.version_no,
        identification: v.identification as RoundArchive['template_version']['identification'],
        required_languages: v.required_languages as RoundArchive['template']['required_languages'],
        origin: v.origin as RoundArchive['template_version']['origin'],
        content_hash: v.content_hash,
        published_at: (v.published_at ?? v.created_at).toISOString(),
        content: v.content as Record<string, unknown>,
      },
      clients: rcs.map((rc) => ({ id: rc.client.id, slug: rc.client.slug, name: rc.client.name })),
      round_clients: rcs.map((rc) => ({
        id: rc.id,
        client_id: rc.client_id,
        status: rc.status as RoundArchive['round_clients'][number]['status'],
        deadline: day(rc.deadline),
        population_snapshot: rc.population_snapshot,
      })),
      metric_definitions: defs.map((d) => ({ key: d.key, version: d.version, definition: d })),
      finding_rules: rules.map((x) => ({
        key: x.key,
        version: x.version,
        channel: x.channel as 'aggregate' | 'leader',
        definition: x.definition as unknown as RoundArchive['finding_rules'][number]['definition'],
      })),
      round_metric_set: set
        ? { metric_keys: set.metric_keys, fixed_at: set.fixed_at.toISOString() }
        : null,
      snapshots,
      findings: findings.map((f) => ({
        id: f.id,
        client_id: f.client_id,
        rule_key: f.rule_key,
        rule_version: f.rule_version,
        numbers: f.numbers as unknown as RoundArchive['findings'][number]['numbers'],
        release_id: f.release_id,
      })),
      finding_sets: sets.map((x) => ({
        release_id: x.release_id,
        scope: x.scope,
        rule_keys: x.rule_keys,
        computed_at: x.computed_at.toISOString(),
      })),
      releases: releasesOf(snapshots),
    };
  }

  async export(round: string, session: PrivacySession | undefined): Promise<RoundArchive> {
    const body = await this.body(round);
    // The file must pass the same schema a restore applies: e.g. no numbers in hidden cells.
    const archive = RoundArchive.parse({ ...body, sha256: archiveHash(body) });
    await this.prisma.auditLog.create({
      data: {
        who: auditWho(session),
        what: 'exports.archive',
        target: `round:${round}`,
        details: {
          snapshots: body.snapshots.length,
          findings: body.findings.length,
          sha256: archive.sha256,
        },
      },
    });
    return archive;
  }

  /** `expected`: the sha256 from the AuditLog entry of the export (CLI `--sha256`). Without it
   * the hash only shows that the file is whole, not who wrote it. */
  async restore(input: unknown, who: string, expected?: string) {
    const parsed = RoundArchive.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ArchiveConflict(
        `not a round archive (${issue?.path.join('.') ?? ''}: ${issue?.message ?? ''})`,
      );
    }
    const { sha256: hash, ...body } = parsed.data;
    if (archiveHash(body) !== hash) throw new ArchiveConflict('sha256 does not match the content');
    if (expected !== undefined && expected !== hash)
      throw new ArchiveConflict(
        'sha256 is not the one of the export (AuditLog); nothing was changed',
      );
    assertArchivedFindings(body, this.privacy.minimumGroupSize);
    assertArchivedSets(body);
    await this.assertAggregateRules(body);
    const id = body.round.id;
    const summary = {
      round: id,
      snapshots: body.snapshots.length,
      findings: body.findings.length,
      sha256: hash,
    };
    if (await this.prisma.round.findUnique({ where: { id } })) {
      const now = await this.body(id).catch(() => null);
      if (!now || restorable(now) !== restorable(body))
        throw new ArchiveConflict('the round exists with other content; nothing was changed');
      await this.audit(this.prisma, who, id, { ...summary, outcome: 'unchanged' });
      return { outcome: 'unchanged' as const, ...summary };
    }
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'archive.restore:' + id}, 0))`;
        await this.parents(tx, body);
        await this.definitions(tx, body);
        const written = await this.privacy.restoreSnapshots(tx, id, body.snapshots, {
          roundClients: new Map(body.round_clients.map((rc) => [rc.id, rc.client_id])),
          metrics: body.metric_definitions.map((d) => ({
            key: d.key,
            version: d.version,
            part: d.definition.part,
          })),
        });
        await tx.finding.createMany({
          data: body.findings.map((f) => ({ ...f, round_id: id })),
        });
        // Without the sets the first dashboard read would compute the releases again with the
        // newest rules, add Findings and change the client report (2.5 × 5.1).
        await tx.findingSet.createMany({
          data: [
            ...(body.finding_sets ?? []).map((x) => ({
              ...x,
              round_id: id,
              computed_at: new Date(x.computed_at),
            })),
            ...derivedSets(body).map((x) => ({ ...x, round_id: id })),
          ],
        });
        await this.audit(tx, who, id, { ...summary, snapshots: written, outcome: 'restored' });
        return { outcome: 'restored' as const, ...summary, snapshots: written };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }

  /** A Finding's rule must be aggregate in the database as well, if the database has it. */
  private async assertAggregateRules(a: ArchiveBody) {
    if (a.findings.length === 0) return;
    const stored = await this.prisma.findingRule.findMany({
      where: { OR: a.findings.map((f) => ({ key: f.rule_key, version: f.rule_version })) },
      select: { key: true, version: true, channel: true },
    });
    const leader = stored.find((r) => r.channel !== 'aggregate');
    if (leader)
      throw new ArchiveConflict(`finding rule ${leader.key}@${leader.version} is not aggregate`);
  }

  private audit(
    db: Prisma.TransactionClient,
    who: string,
    round: string,
    details: Record<string, string | number>,
  ) {
    return db.auditLog.create({
      data: { who, what: 'archive.restore', target: `round:${round}`, details },
    });
  }

  /** Template, version, clients, round and RoundClients with the archived ids (no codes). */
  private async parents(tx: Prisma.TransactionClient, a: ArchiveBody) {
    const t = await tx.surveyTemplate.findUnique({ where: { id: a.template.id } });
    if (t && t.key !== a.template.key)
      throw new ArchiveConflict(`template ${t.id} has another key`);
    if (!t) {
      if (await tx.surveyTemplate.findUnique({ where: { key: a.template.key } }))
        throw new ArchiveConflict(`template ${a.template.key} exists with another id`);
      await tx.surveyTemplate.create({ data: a.template });
    }
    const v = await tx.templateVersion.findUnique({ where: { id: a.template_version.id } });
    if (
      v &&
      (v.content_hash !== a.template_version.content_hash || v.template_id !== a.template.id)
    )
      throw new ArchiveConflict(`template version ${v.id} has other content`);
    if (!v) {
      const { content, published_at, ...rest } = a.template_version;
      await tx.templateVersion.create({
        data: {
          ...rest,
          status: 'published',
          published_at: new Date(published_at),
          content: content as Prisma.InputJsonObject,
        },
      });
    }
    for (const c of a.clients) {
      const found = await tx.client.findUnique({ where: { id: c.id } });
      if (found && found.slug !== c.slug)
        throw new ArchiveConflict(`client ${c.id} has another slug`);
      if (found) continue;
      if (await tx.client.findUnique({ where: { slug: c.slug } }))
        throw new ArchiveConflict(`client ${c.slug} exists with another id`);
      await tx.client.create({ data: c });
    }
    const r = a.round;
    await tx.round.create({
      data: {
        ...r,
        created_at: new Date(r.created_at),
        opened_at: r.opened_at === null ? null : new Date(r.opened_at),
        closed_at: r.closed_at === null ? null : new Date(r.closed_at),
      },
    });
    const known = new Set(a.clients.map((c) => c.id));
    if (a.round_clients.some((rc) => !known.has(rc.client_id)))
      throw new ArchiveConflict('a round client refers to a client outside the archive');
    await tx.roundClient.createMany({
      data: a.round_clients.map((rc) => ({ ...rc, round_id: r.id, deadline: date(rc.deadline) })),
    });
  }

  /** Versioned definitions are immutable: the same key@version must have the same content.
   * A version is added only for a key the database does not know at all: the newest version of
   * a key is the one in force (FindingsService.rules), so a new version of a known key would
   * change the results of other rounds. The same holds for a key that is new to a template
   * family the database already has: definitionsFor() and FindingsService.rules() read every
   * key of the family. Several rounds of one family are restored from the newest archive to the
   * oldest: an older archive carries a subset of the newer one's definitions. */
  private async definitions(tx: Prisma.TransactionClient, a: ArchiveBody) {
    const family = `${a.template.key}.`;
    const inFamily = { key: { startsWith: family } };
    const metricFamily = (await tx.metricDefinition.count({ where: inFamily })) > 0;
    const ruleFamily = (await tx.findingRule.count({ where: inFamily })) > 0;
    const metricKeys = new Set(
      (
        await tx.metricDefinition.findMany({
          where: { key: { in: a.metric_definitions.map((d) => d.key) } },
          select: { key: true },
        })
      ).map((d) => d.key),
    );
    for (const d of a.metric_definitions) {
      const found = await tx.metricDefinition.findUnique({
        where: { key_version: { key: d.key, version: d.version } },
      });
      if (found && canonical(found.definition) !== canonical(d.definition))
        throw new ArchiveConflict(`metric ${d.key}@${d.version} differs from the database`);
      if (!found && metricKeys.has(d.key))
        throw new ArchiveConflict(
          `metric ${d.key} is in the database in other versions; adding version ${d.version} would change other rounds`,
        );
      if (!found && !metricKeys.has(d.key) && metricFamily && d.key.startsWith(family))
        throw new ArchiveConflict(
          `metric ${d.key} is new to the ${a.template.key} metrics in the database; adding it would change other rounds`,
        );
      if (!found) await tx.metricDefinition.create({ data: d });
    }
    const ruleKeys = new Set(
      (
        await tx.findingRule.findMany({
          where: { key: { in: a.finding_rules.map((x) => x.key) } },
          select: { key: true },
        })
      ).map((x) => x.key),
    );
    for (const x of a.finding_rules) {
      const found = await tx.findingRule.findUnique({
        where: { key_version: { key: x.key, version: x.version } },
      });
      if (found && canonical(found.definition) !== canonical(x.definition))
        throw new ArchiveConflict(`finding rule ${x.key}@${x.version} differs from the database`);
      if (!found && ruleKeys.has(x.key))
        throw new ArchiveConflict(
          `finding rule ${x.key} is in the database in other versions; adding version ${x.version} would change other rounds`,
        );
      if (!found && !ruleKeys.has(x.key) && ruleFamily && x.key.startsWith(family))
        throw new ArchiveConflict(
          `finding rule ${x.key} is new to the ${a.template.key} rules in the database; adding it would change other rounds`,
        );
      if (!found) await tx.findingRule.create({ data: x });
    }
    const rules = new Set(a.finding_rules.map((x) => `${x.key}@${x.version}`));
    const clients = new Set(a.clients.map((c) => c.id));
    for (const f of a.findings)
      if (
        !rules.has(`${f.rule_key}@${f.rule_version}`) ||
        (f.client_id && !clients.has(f.client_id))
      )
        throw new ArchiveConflict(`finding ${f.id} refers outside the archive`);
    if (a.round_metric_set)
      await tx.roundMetricSet.create({
        data: { round_id: a.round.id, ...a.round_metric_set },
      });
  }
}
