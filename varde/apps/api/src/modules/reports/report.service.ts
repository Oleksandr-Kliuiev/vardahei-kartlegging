// Client report (5.1, ADR-025 «samla bilete utan initialar»): one RoundClient of a closed round,
// read only from released `round_client` snapshots through privacy (class `aggregate`, common
// part) and from the saved aggregate Findings of that release. No Response, no `rows`, no
// leader endpoint and no `leaders_all`. Every report is an AuditLog entry. Sending is manual.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Round } from '@prisma/client';
import type { MetricDefinition } from '@varde/schema/metrics/metric-definition';
import type { TemplateContent } from '@varde/schema/template/template';
import { PrismaService } from '../../prisma/prisma.service.js';
import { auditWho } from '../auth/audit-who.js';
import { change } from '../dashboard/comparison-view.js';
import { FindingRule } from '../findings/finding-rule.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { PrivacyService, type PrivacySession, type ViewCell } from '../privacy/privacy.service.js';
import {
  byDashboardOrder,
  defaultLanguage,
  degreeOf,
  findingText,
  osloDay,
  questionLabel,
  type ReportLang,
  reportLanguages,
  respondents,
  ruleLang,
  type SavedNumbers,
  scoreDefs,
  scoredQuestions,
  scoreStats,
  weakest,
} from './report-parts.js';

const CLOSED = ['closed', 'archived'];
const day = (d: Date | null) => (d === null ? null : osloDay(d));
const period = (r: Round) => ({ opened: day(r.opened_at), closed: day(r.closed_at) });

interface Side {
  round: Round;
  defs: MetricDefinition[];
  cells: ViewCell[];
}

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly privacy: PrivacyService,
    private readonly metrics: MetricsService,
  ) {}

  /** Released common cells of one client; never the live view, never leader cells. */
  private async side(round: Round, slug: string): Promise<Side> {
    const defs = (await this.metrics.definitionsFor(round.id)).filter((d) => d.part === 'common');
    const cells = await this.privacy.viewCells(round.id, 'round_client', defs, slug, true);
    return { round, defs, cells };
  }

  /** The latest earlier closed round of the same template family with this client released. */
  private async previous(round: Round, family: string, client: { id: string; slug: string }) {
    const candidates = await this.prisma.round.findMany({
      where: {
        id: { not: round.id },
        status: { in: CLOSED },
        created_at: { lt: round.created_at },
        template_version: { template: { key: family } },
        round_clients: { some: { client_id: client.id } },
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
    for (const r of candidates) {
      const side = await this.side(r, client.slug);
      if (side.cells.length > 0) return side;
    }
    return undefined;
  }

  private async findings(
    round: string,
    clientId: string,
    now: Side,
    lang: ReportLang,
    content: TemplateContent,
  ) {
    const releases = [
      ...new Set(now.cells.flatMap((c) => (!c.suppressed && c.release_id ? [c.release_id] : []))),
    ];
    if (releases.length === 0) return [];
    const rows = await this.prisma.finding.findMany({
      where: { round_id: round, client_id: clientId, release_id: { in: releases } },
    });
    // A release saves its Findings once (2.5, FindingsService.released); should history hold
    // a second row of a later version, the report keeps the version in force at release: the lowest.
    const first = new Map<string, (typeof rows)[number]>();
    for (const f of rows) {
      const seen = first.get(f.rule_key);
      if (!seen || f.rule_version < seen.rule_version) first.set(f.rule_key, f);
    }
    const saved = [...first.values()];
    if (saved.length === 0) return [];
    const rules = await this.prisma.findingRule.findMany({
      where: { OR: saved.map((f) => ({ key: f.rule_key, version: f.rule_version })) },
    });
    const ruleOf = new Map(rules.map((r) => [`${r.key}@${r.version}`, r]));
    return saved
      .flatMap((f) => {
        const row = ruleOf.get(`${f.rule_key}@${f.rule_version}`);
        // Only aggregate rules of this template reach the client (ADR-026); leader never.
        if (!row || row.channel !== 'aggregate') return [];
        const rule = FindingRule.parse(row.definition);
        if (rule.channel !== 'aggregate') return [];
        return [{ rule, numbers: f.numbers as unknown as SavedNumbers }];
      })
      .sort(byDashboardOrder)
      .slice(0, 3)
      .map(({ rule, numbers }) => ({
        key: rule.key,
        level: numbers.level,
        severity: rule.severity,
        lang: ruleLang(lang),
        ...findingText(rule, numbers, lang, now.cells, content),
      }));
  }

  private comparison(now: Side, before: Side | undefined, content: TemplateContent) {
    if (!before) return null;
    const a = scoreDefs(now.defs),
      b = scoreDefs(before.defs);
    const degree = weakest([
      degreeOf(a.mean, b.mean),
      degreeOf(a.critical, b.critical),
      degreeOf(a.zone, b.zone),
    ]);
    const was = scoreStats(before.cells, b),
      is = scoreStats(now.cells, a);
    if (degree === 'incomparable' || was.mean === null || is.mean === null) return null;
    return {
      round: { name: before.round.name, type: before.round.type, ...period(before.round) },
      degree,
      before: { ...was, respondents: respondents(before.cells, before.defs, content) },
      now: { ...is, respondents: respondents(now.cells, now.defs, content) },
      change: {
        mean: change(was.mean, is.mean),
        critical: change(was.critical, is.critical, true),
      },
    };
  }

  async build(id: string, requested: string | undefined, session: PrivacySession | undefined) {
    const rc = await this.prisma.roundClient.findUnique({
      where: { id },
      include: {
        client: true,
        round: { include: { template_version: { include: { template: true } } } },
      },
    });
    const version = rc?.round.template_version;
    // A seminar live poll (3.4) has no client report, whatever its state.
    if (!rc || !version || rc.round.type === 'live')
      throw new NotFoundException('Kartlegginga finst ikkje.');
    const languages = reportLanguages(version.required_languages);
    const lang = (requested ?? defaultLanguage(languages, rc.client.default_lang)) as ReportLang;
    if (!languages.includes(lang))
      throw new BadRequestException('Rapporten finst ikkje på dette språket.');
    if (!CLOSED.includes(rc.round.status))
      throw new ConflictException('Rapporten kan lagast når runden er avslutta.');
    const content = version.content as unknown as TemplateContent;
    const now = await this.side(rc.round, rc.client.slug);
    if (now.cells.length === 0)
      throw new ConflictException('Runden har ingen publiserte tal for denne kunden enno.');
    const family = version.template.key;
    const before = await this.previous(rc.round, family, rc.client);
    const comparison = this.comparison(now, before, content);
    const defs = scoreDefs(now.defs);
    const report = {
      class: 'aggregate' as const,
      round_client: rc.id,
      round: { id: rc.round.id, name: rc.round.name, type: rc.round.type, ...period(rc.round) },
      client: { name: rc.client.name },
      template: family,
      lang,
      languages,
      generated: osloDay(new Date()),
      // The same contact as the respondents saw on the finish screen (decision of Oleksandr 16.10).
      contact: content.intro.contact,
      respondents: respondents(now.cells, now.defs, content),
      zone: defs.mean ? scoreStats(now.cells, defs) : null,
      findings: await this.findings(rc.round.id, rc.client_id, now, lang, content),
      questions: scoredQuestions(content).map((q) => ({
        id: q.id,
        label: questionLabel(q, lang),
        ...scoreStats(now.cells, defs, q.id),
        before:
          comparison && before ? scoreStats(before.cells, scoreDefs(before.defs), q.id) : null,
      })),
      comparison,
    };
    await this.prisma.auditLog.create({
      data: {
        who: auditWho(session),
        what: 'report.client',
        target: `round_client:${rc.id}`,
        details: { round: rc.round.id, client: rc.client_id, lang },
      },
    });
    return report;
  }
}
export type ClientReport = Awaited<ReturnType<ReportService['build']>>;
