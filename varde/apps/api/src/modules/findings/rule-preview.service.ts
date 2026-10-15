// Preview of a rule draft (2.5): the current version and the draft on the same input the dashboard
// reads. Aggregate rules: view cells from PrivacyService (k = 3, suppressed cells give no outcome).
// Leader rules: the audited leader endpoint per client, `leaders_all` at «alle», and F12 × B13 at
// «alle» through one audited leader read per client, exactly as LeaderView does (ADR-021 (a)).
import { BadRequestException, Injectable } from '@nestjs/common';
import { DashboardContext } from '../dashboard/dashboard-context.js';
import { LeaderView } from '../dashboard/leader-view.js';
import { PrivacyService, type PrivacySession } from '../privacy/privacy.service.js';
import { explainCells, explainClients, explainLeader, type Outcome } from './explain.js';
import type { FindingRule } from './finding-rule.js';
import { FindingsService } from './findings.service.js';
import { crossSelected } from './leader-rules.js';
import { familyOf } from './rule-choices.js';
import { RuleVersions } from './rule-versions.service.js';

export interface PreviewInput {
  rule: unknown;
  round: string;
  client: string;
}

@Injectable()
export class RulePreview {
  constructor(
    private readonly versions: RuleVersions,
    private readonly context: DashboardContext,
    private readonly privacy: PrivacyService,
    private readonly findings: FindingsService,
    private readonly leader: LeaderView,
  ) {}

  async run(key: string, input: PreviewInput, session: PrivacySession | undefined) {
    const { rule: current, context } = await this.versions.current(key);
    const draft = this.versions.previewDraft(current, input.rule, context);
    const scope = await this.context.load(
      input.round,
      input.client === 'alle' ? undefined : input.client,
    );
    if (scope.content.key !== familyOf(key))
      throw new BadRequestException('Runden brukar eit anna skjema enn regelen.');
    const closed = ['closed', 'archived'].includes(scope.round.status);
    const fixed = closed
      ? ((await this.findings.rulesFor(scope.round, scope.content.key, current.channel)).find(
          (r) => r.key === key,
        )?.version ?? null)
      : current.version;
    const [now, next] = await this.outcomes(scope, [current, draft], session);
    return {
      round: { id: scope.round.id, name: scope.round.name, status: scope.round.status },
      client: scope.client ?? null,
      source: closed ? ('released' as const) : ('live' as const),
      fixed_version: fixed,
      audited: current.channel === 'leader' && (!!scope.client || current.computed === 'f12_b13'),
      current: { version: current.version, outcome: now! },
      draft: { outcome: next! },
    };
  }

  private async outcomes(
    scope: Awaited<ReturnType<DashboardContext['load']>>,
    rules: FindingRule[],
    session: PrivacySession | undefined,
  ): Promise<Outcome[]> {
    const [rule] = rules;
    const round = scope.round.id;
    if (rule!.channel === 'aggregate') {
      const cells = await this.privacy.viewCells(
        round,
        scope.client ? 'round_client' : 'all_clients',
        scope.defs.filter((d) => d.part === 'common'),
        scope.client,
      );
      return rules.map((r) => explainCells(r, cells, scope.content, 'all'));
    }
    if (scope.client) {
      const rows = await this.privacy.leaderAnswers({ round, client: scope.client }, session);
      const selected = rules.find((r) => r.computed === 'f12_b13' && crossSelected(r, rows));
      const f12 = selected ? await this.leader.crossCell(scope, selected) : undefined;
      return rules.map((r) => explainLeader(r, rows, f12));
    }
    if (rule!.computed === 'f12_b13')
      return (await this.leader.crossCounts(scope, rules, session)).map(explainClients);
    const cells = await this.privacy.viewCells(
      round,
      'leaders_all',
      scope.defs.filter((d) => d.part === 'leader'),
    );
    return rules.map((r) => explainCells(r, cells, scope.content, 'all'));
  }
}
