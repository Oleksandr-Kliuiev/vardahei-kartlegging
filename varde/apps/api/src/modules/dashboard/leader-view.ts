import { FindingsService } from '../findings/findings.service.js';
import type { FindingView } from '../findings/finding-rule.js';
import { Injectable } from '@nestjs/common';
import { PrivacyService, type PrivacySession } from '../privacy/privacy.service.js';
import { questionViews } from './aggregate-view.js';
import { DashboardContext } from './dashboard-context.js';

// Exact headers and option labels of dashboard.html::LEIAR_KOL/leiartabell.
export const LEADER_COLUMNS: Record<string, [string, string][]> = {
  tryggleik: [
    ['B2', 'Tolar stans'],
    ['B5', 'IT-ansvar'],
    ['B13', 'Plan ved angrep'],
    ['B12', 'Backup testa'],
    ['B9', 'Sluttar'],
    ['B10', 'Privat mobil'],
    ['B18', 'Nytt kontonr.'],
    ['B11', 'Delte innloggingar'],
    ['B16', 'NPS'],
  ],
  ki: [
    ['L11', 'Førespurnader/veke'],
    ['L4', 'KI-reglar'],
    ['L5', 'Betaler for KI'],
    ['L7', 'Første gevinst'],
    ['L8', 'Når'],
    ['L10', 'Vil ha ein prat'],
  ],
};
const LEADER_SIGNALS: Record<string, Record<string, string>> = {
  B2: { t2: 'high', dag: 'medium', d23: 'good', veke: 'good', vk: 'medium' },
  B5: { ingen: 'high', vardahei: 'medium', tilsett: 'good', dagleg: 'good' },
  B13: { skrive: 'good', ide: 'medium', nei: 'high', vardahei: 'high' },
  B12: { siste: 'good', lenge: 'medium', nei: 'high', vk: 'high' },
  B9: { vardahei: 'good', sjolv: 'good', etter: 'high', vk: 'high' },
  B10: { reglar: 'good', nei: 'good', utan: 'medium', ikkje: 'high' },
  B18: { ring: 'good', to: 'good', svar: 'high', endrar: 'high', rekneskap: 'medium', vk: 'high' },
  L4: { skrive: 'good', uformelt: 'medium', nei: 'high', vk: 'high' },
  L5: { alle: 'good', nokre: 'good', gratis: 'high', nei: 'medium', vk: 'medium' },
  L8: { no: 'good', halvar: 'good', ar: 'medium', ikkje: 'medium' },
  L10: { ja: 'good', seinare: 'medium', nei: 'medium' },
};
function signal(id: string, value: unknown) {
  const values = Array.isArray(value) ? value : [value],
    rank = ['high', 'medium', 'good'];
  return rank.find((s) => values.some((v) => LEADER_SIGNALS[id]?.[String(v)] === s)) ?? '';
}
export function answerLabel(
  content: Awaited<ReturnType<DashboardContext['load']>>['content'],
  id: string,
  value: unknown,
): string {
  const q = content.questions.find((q) => q.id === id);
  if (value === null || value === undefined) return '–';
  if (q?.type === 'scale' && typeof value === 'object' && !Array.isArray(value))
    return q.rows
      .map(
        (r) =>
          `${r.texts.text.nn}: ${typeof (value as Record<string, unknown>)[r.id] === 'number' ? String((value as Record<string, number>)[r.id]) : '–'}`,
      )
      .join(', ');
  return (Array.isArray(value) ? value : [value])
    .map((v) =>
      q && 'options' in q
        ? (q.options.find((o) => o.id === v)?.texts.text.nn ?? String(v))
        : String(v),
    )
    .join(', ');
}
@Injectable()
export class LeaderView {
  constructor(
    private readonly context: DashboardContext,
    private readonly privacy: PrivacyService,
    private readonly findings: FindingsService,
  ) {}
  async client(round: string, client: string, session: PrivacySession | undefined) {
    const scope = await this.context.load(round, client);
    const rows = await this.privacy.leaderAnswers({ round, client: scope.client! }, session);
    const columns = LEADER_COLUMNS[scope.content.key] ?? [];
    const findings = await this.clientFindings(scope, rows);
    return {
      findings,
      class: 'leader' as const,
      round,
      client: scope.client,
      client_name: scope.clients.find((c) => c.slug === scope.client)?.name ?? scope.client,
      columns: columns.map(([id, label]) => ({ id, label })),
      table: rows.map((r) => ({
        submission_id: r.submission_id,
        cells: columns.map(([id]) => answerLabel(scope.content, id, r.answers[id])),
        signals: columns.map(([id]) => signal(id, r.answers[id])),
      })),
      rows: rows.map((r) => ({
        ...r,
        display: Object.fromEntries(
          scope.content.questions
            .filter((q) => q.part === 'leader')
            .map((q) => [q.id, answerLabel(scope.content, q.id, r.answers[q.id])]),
        ),
      })),
      questions: scope.content.questions
        .filter((q) => q.part === 'leader')
        .map((q) => ({ id: q.id, label: q.texts.text.nn })),
    };
  }
  async summary(round: string, session: PrivacySession | undefined) {
    const scope = await this.context.load(round);
    const cells = await this.privacy.viewCells(
      round,
      'leaders_all',
      scope.defs.filter((d) => d.part === 'leader'),
    );
    const findings = await this.findings.calculate(scope.content, cells, 'all', 'leader');
    // Cross-part signals are computed only in the audited leader channel. The response
    // contains a number of clients, never their names, identifiers or leader responses.
    let count = 0;
    const crossRule = (await this.findings.rules(scope.content.key, 'leader')).find(
      (r) => r.computed === 'f12_b13',
    );
    if (crossRule)
      for (const c of scope.clients) {
        const own = await this.context.load(round, c.slug);
        const rows = await this.privacy.leaderAnswers({ round, client: c.slug }, session);
        if ((await this.clientFindings(own, rows)).some((f) => f.key === crossRule.key)) count++;
      }
    if (crossRule && count)
      findings.push({
        key: crossRule.key,
        version: crossRule.version,
        channel: 'leader',
        n: count,
        count,
        share: 0.5,
        level: 'medium',
        text: crossRule.text.nn,
        action: crossRule.action_text.nn,
        severity: crossRule.severity,
        tal: `${count} kundar`,
        order: crossRule.order,
      });
    return {
      findings,
      class: 'aggregate' as const,
      round,
      questions: questionViews(scope, cells, 'all', 'leader'),
    };
  }
  private async clientFindings(
    scope: Awaited<ReturnType<DashboardContext['load']>>,
    rows: Awaited<ReturnType<PrivacyService['leaderAnswers']>>,
  ) {
    const rules = await this.findings.rules(scope.content.key, 'leader');
    const out: FindingView[] = [];
    for (const r of rules.filter((r) => !r.computed)) {
      const basis = rows.filter((row) => row.answers[r.question!] !== undefined);
      const hit = basis.filter((row) => {
        const value = row.answers[r.question!];
        return (Array.isArray(value) ? value : [value]).some((v) =>
          r.raw_options?.includes(String(v)),
        );
      });
      if (hit.length)
        out.push({
          key: r.key,
          version: r.version,
          channel: 'leader',
          n: basis.length,
          count: hit.length,
          share: hit.length / basis.length,
          level: r.level ?? 'medium',
          text: r.text.nn,
          action: r.action_text.nn,
          severity: r.severity,
          tal: 'Leiaren',
          order: r.order,
        });
    }
    const cross = rules.find((r) => r.computed === 'f12_b13');
    if (cross && rows.some((r) => cross.options.includes(String(r.answers.B13)))) {
      const common = await this.privacy.viewCells(
        scope.round.id,
        'round_client',
        scope.defs.filter((d) => d.part === 'common'),
        scope.client,
      );
      const c = common.find(
        (c) => c.metric_key === 'tryggleik.f12.distribution.ja' && c.group === 'all',
      );
      if (
        c &&
        !c.suppressed &&
        c.n >= cross.min_count &&
        c.denominator &&
        c.numerator / c.denominator >= cross.threshold.medium
      )
        out.push({
          key: cross.key,
          version: cross.version,
          channel: 'leader',
          n: c.denominator,
          count: c.numerator,
          share: 0.5,
          level: 'medium',
          text: cross.text.nn,
          action: cross.action_text.nn,
          severity: cross.severity,
          tal: `${Math.round((100 * c.numerator) / c.denominator)} %`,
          order: cross.order,
        });
    }
    return out.sort(
      (a, b) =>
        (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1) ||
        b.share - a.share ||
        a.order - b.order,
    );
  }
}
export type LeaderModel = Awaited<ReturnType<LeaderView['client']>>;
export type LeaderSummary = Awaited<ReturnType<LeaderView['summary']>>;
