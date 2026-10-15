import { FindingsService } from '../findings/findings.service.js';
import type { FindingRule, FindingView } from '../findings/finding-rule.js';
import { evaluate } from '../findings/evaluate.js';
import {
  byLevel,
  crossCellKey,
  crossFinding,
  crossSelected,
  crossSummary,
  leaderFinding,
  type LeaderAnswers,
} from '../findings/leader-rules.js';
import { Injectable } from '@nestjs/common';
import { PrivacyService, type PrivacySession } from '../privacy/privacy.service.js';
import { questionViews } from './aggregate-view.js';
import { DashboardContext, type DashboardScope } from './dashboard-context.js';

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
    const rules = await this.findings.rulesFor(scope.round, scope.content.key, 'leader');
    const findings = await this.clientFindings(scope, rows, rules);
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
    const rules = await this.findings.rulesFor(scope.round, scope.content.key, 'leader');
    const findings = evaluate(rules, cells, scope.content, 'all', 'leader');
    // Cross-part signals are computed only in the audited leader channel. The response
    // contains a number of clients, never their names, identifiers or leader responses.
    const cross = rules.find((r) => r.computed === 'f12_b13');
    const [count = 0] = cross ? await this.crossCounts(scope, [cross], session) : [];
    if (cross && count) findings.push(crossSummary(cross, count));
    return {
      findings,
      class: 'aggregate' as const,
      round,
      questions: questionViews(scope, cells, 'all', 'leader'),
    };
  }
  /** Clients where each cross rule holds: one audited leader read per client (ADR-026). */
  async crossCounts(
    scope: DashboardScope,
    rules: readonly FindingRule[],
    session: PrivacySession | undefined,
  ) {
    const counts = rules.map(() => 0);
    for (const c of scope.clients) {
      const own = await this.context.load(scope.round.id, c.slug);
      const rows = await this.privacy.leaderAnswers(
        { round: scope.round.id, client: c.slug },
        session,
      );
      const selected = rules.find((r) => crossSelected(r, rows));
      const cell = selected ? await this.crossCell(own, selected) : undefined;
      rules.forEach((r, i) => {
        if (crossFinding(r, rows, cell)) counts[i]!++;
      });
    }
    return counts;
  }
  /** The common F12 cell of one client under k, read through privacy like the dashboard. */
  async crossCell(scope: DashboardScope, cross: FindingRule) {
    const common = await this.privacy.viewCells(
      scope.round.id,
      'round_client',
      scope.defs.filter((d) => d.part === 'common'),
      scope.client,
    );
    return common.find((c) => c.metric_key === crossCellKey(cross) && c.group === 'all');
  }
  async clientFindings(
    scope: DashboardScope,
    rows: readonly LeaderAnswers[],
    rules: readonly FindingRule[],
  ) {
    const out: FindingView[] = rules
      .filter((r) => !r.computed)
      .flatMap((r) => leaderFinding(r, rows) ?? []);
    const cross = rules.find((r) => r.computed === 'f12_b13');
    if (cross && crossSelected(cross, rows)) {
      const found = crossFinding(cross, rows, await this.crossCell(scope, cross));
      if (found) out.push(found);
    }
    return out.sort(byLevel);
  }
}
export type LeaderModel = Awaited<ReturnType<LeaderView['client']>>;
export type LeaderSummary = Awaited<ReturnType<LeaderView['summary']>>;
