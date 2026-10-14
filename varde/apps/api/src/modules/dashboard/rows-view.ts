import { Injectable } from '@nestjs/common';
import { personScore, personLevel, type Scoring } from '@varde/rules/findings';
import {
  PrivacyService,
  type PrivacySession,
  type PrivacyRow,
  NotFoundError,
} from '../privacy/privacy.service.js';
import { DashboardContext, type DashboardScope } from './dashboard-context.js';
import { KI_COLUMNS } from './ki-columns.js';
import { labelOf } from './aggregate-view.js';

const identity = (r: PrivacyRow) => `${r.client}|${r.respondent_key ?? ''}`;
const scoring = (scope: DashboardScope) => {
  const def = scope.defs.find((d) => d.kind === 'zone');
  return {
    table: (def?.options_mapping ?? {}) as Scoring,
    questions: def?.questions.map((q) => q.key) ?? [],
    bounds: def?.thresholds?.person.bounds ?? [],
  };
};
@Injectable()
export class RowsView {
  constructor(
    private readonly context: DashboardContext,
    private readonly privacy: PrivacyService,
  ) {}
  async perEmployee(
    round: string,
    client: string | undefined,
    session: PrivacySession | undefined,
    audit: 'privacy.rows' | 'exports.master_analyse' = 'privacy.rows',
  ) {
    const scope = await this.context.load(round, client);
    if (scope.round.identification === 'none') throw new NotFoundError();
    const previous = await this.context.previous(scope);
    const { current, prior } = await this.privacy.employeeHistory(
      { round, ...(scope.client ? { client: scope.client } : {}) },
      previous?.round.id,
      session,
      audit,
    );
    const prev = new Map(prior.filter((r) => r.respondent_key).map((r) => [identity(r), r]));
    const sc = scoring(scope),
      ps = previous ? scoring(previous) : sc;
    const roleQ = scope.content.questions.find((q) => q.role);
    const label = (r: PrivacyRow) =>
      roleQ && 'options' in roleQ
        ? (roleQ.options
            .find((o) => o.id === r.role)
            ?.texts.text.nn.split('/')[0]!
            .split(' eller ')[0]!
            .trim() ?? '–')
        : '–';
    const summary = { matched: 0, better: 0, worse: 0, same: 0 };
    const rows = current.map((r) => {
      const base = {
        submission_id: r.submission_id,
        respondent_key: r.respondent_key ?? '',
        role: label(r),
        client: r.client,
        client_name: scope.clients.find((c) => c.slug === r.client)?.name ?? r.client,
      };
      const old = r.respondent_key ? prev.get(identity(r)) : undefined;
      if (scope.content.key === 'ki') {
        const level = (v: unknown) =>
          typeof v === 'string' && /^n[0-4]$/.test(v) ? Number(v.slice(1)) : -1;
        const a = level(old?.answers.K9),
          b = level(r.answers.K9);
        return {
          ...base,
          mean: null,
          zone: null,
          marked: [],
          previous:
            a < 0
              ? null
              : {
                  label: KI_COLUMNS[2]!.short[String(old!.answers.K9)]!,
                  mean: null,
                  zone: null,
                  change: b < 0 ? null : b > a ? 'opp' : b < a ? 'ned' : 'likt',
                },
          columns: KI_COLUMNS.map((c) => ({
            id: c.id,
            label: c.short[String(r.answers[c.id])] ?? '–',
            marked: c.marked?.includes(String(r.answers[c.id])) ?? false,
          })),
        };
      }
      const mean = personScore(r, sc.table, sc.questions),
        oldMean = old ? personScore(old, ps.table, ps.questions) : null;
      const change =
        mean !== null && oldMean !== null
          ? mean - oldMean < -0.05
            ? 'betre'
            : mean - oldMean > 0.05
              ? 'verre'
              : 'likt'
          : null;
      if (change) {
        summary.matched++;
        if (change === 'betre') summary.better++;
        else if (change === 'verre') summary.worse++;
        else summary.same++;
      }
      const marked = scope.content.questions
        .flatMap((q) => {
          const score = sc.table[q.id]?.[String(r.answers[q.id])];
          return score !== undefined && score >= 2 ? [{ id: q.id, label: labelOf(q), score }] : [];
        })
        .sort((a, b) => b.score - a.score);
      return {
        ...base,
        mean,
        zone: mean === null ? null : personLevel(mean, sc.bounds),
        marked,
        previous:
          oldMean === null
            ? null
            : { mean: oldMean, zone: personLevel(oldMean, ps.bounds), label: null, change },
        columns: [],
      };
    });
    rows.sort((a, b) =>
      scope.content.key === 'ki'
        ? a.client_name.localeCompare(b.client_name) ||
          a.respondent_key.localeCompare(b.respondent_key)
        : (b.mean ?? -1) - (a.mean ?? -1),
    );
    return {
      class: 'rows' as const,
      round,
      template: scope.content.key,
      client: scope.client ?? null,
      previous_round: previous ? { id: previous.round.id, name: previous.round.name } : null,
      summary,
      columns:
        scope.content.key === 'ki' ? KI_COLUMNS.map((c) => ({ id: c.id, label: c.label })) : [],
      rows,
    };
  }
  async quotes(round: string, client: string | undefined, session: PrivacySession | undefined) {
    const scope = await this.context.load(round, client);
    const result = await this.privacy.rows(
      { round, ...(scope.client ? { client: scope.client } : {}) },
      session,
    );
    const roles = new Map<string, number>();
    for (const r of result.rows) roles.set(r.role, (roles.get(r.role) ?? 0) + 1);
    const roleQ = scope.content.questions.find((q) => q.role);
    const quotes = result.rows.flatMap((r) =>
      scope.content.questions
        .filter((q) => q.part === 'common' && !q.identifier)
        .flatMap((q) => {
          const texts = [q.type === 'text' ? r.answers[q.id] : null, r.free?.[q.id]].filter(
            (t): t is string => typeof t === 'string' && t.trim().length > 0,
          );
          return texts.map((text) => ({
            submission_id: r.submission_id,
            question: q.id,
            label: q.texts.text.nn,
            text,
            client: r.client,
            client_name: scope.clients.find((c) => c.slug === r.client)?.name ?? r.client,
            ...((roles.get(r.role) ?? 0) >= this.privacy.minimumGroupSize &&
            roleQ &&
            'options' in roleQ
              ? { role: roleQ.options.find((o) => o.id === r.role)?.texts.text.nn ?? r.role }
              : {}),
          }));
        }),
    );
    return { class: 'rows' as const, round, mode: result.mode, quotes };
  }
}
export type EmployeeModel = Awaited<ReturnType<RowsView['perEmployee']>>;
export type QuotesModel = Awaited<ReturnType<RowsView['quotes']>>;
