// «Før og etter» of a seminar (3.9, ARCHITECTURE §7): the survey before and the survey after,
// compared for the seminar's clients — per client and per question — only through privacy: a
// closed round from its released snapshots, an open one live with k as the dashboard; a hidden
// group has no numbers (privacy.clientGroup: the seminar's clients from each round's all_clients
// view, a hidden client hides their sum). Numbers only for questions in both rounds whose question
// and metric may be compared (`comparability` of MetricDefinition, ADR-020; anchors, ADR-005): a
// changed question or metric is marked, with no change. The caveats are always given: who answered,
// self-selection, comparability, and no claim that the seminar caused anything.
import { Injectable, NotFoundException } from '@nestjs/common';
import type { MetricDefinition } from '@varde/schema/metrics/metric-definition';
import type { Question } from '@varde/schema/template/question';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PrivacyService, type ViewCell } from '../privacy/privacy.service.js';
import { labelOf, valueOf } from './aggregate-view.js';
import { DashboardContext, type DashboardScope } from './dashboard-context.js';
import { change, type Comparable, metricLink, questionChange, SAME, worst } from './round-pair.js';

/** Always on the screen (nynorsk): who answered, self-selection, comparability, no causal claim. */
export const CAVEATS = [
  'Det er ikkje nødvendigvis dei same personane som svarte før og etter, og heller ikkje like mange.',
  'Dei som vel å svare, kan skilje seg frå dei som ikkje svarar (sjølvval).',
  'Vi samanliknar berre spørsmål som er med i begge undersøkingane og blir rekna ut på same måten. Er spørsmålet eller utrekninga endra, står det ved spørsmålet, og vi viser inga endring.',
  'Vi ser endringa, men kan ikkje seie at seminaret gjorde det.',
] as const;

type Choice = Extract<Question, { type: 'single' | 'multi' }>;
type Kind = 'distribution' | 'mean_score' | 'critical_share';

const choices = (s: DashboardScope) =>
  s.content.questions.filter(
    (q): q is Choice =>
      q.part === 'common' && !q.identifier && (q.type === 'single' || q.type === 'multi'),
  );
const scored = (q: Choice) => q.options.some((o) => o.score !== undefined);

/** Definitions of a kind (for question `q`) with cells in the round, the latest version first. */
function defsOf(s: DashboardScope, cells: readonly ViewCell[], kind: Kind, q?: string) {
  return s.defs
    .filter(
      (d) =>
        d.part === 'common' &&
        d.kind === kind &&
        d.scale !== 'answer_categories' &&
        (q === undefined ||
          (kind === 'distribution'
            ? d.questions[0]?.key === q
            : d.questions.some((x) => x.key === q))) &&
        cells.some((c) => c.metric_version === d.version && c.metric_key.startsWith(`${d.key}.`)),
    )
    .sort((a, b) => b.version - a.version);
}

/** The pair to compare: a definition both rounds use, else the latest of each. */
function pick(b: MetricDefinition[], a: MetricDefinition[]) {
  const same = b.find((x) => a.some((y) => y.key === x.key && y.version === x.version));
  return same ? ([same, same] as const) : ([b[0], a[0]] as const);
}

const at = (
  cells: readonly ViewCell[],
  d: MetricDefinition | undefined,
  sub: string,
  group: string,
) =>
  d
    ? cells.find(
        (c) =>
          c.metric_key === `${d.key}.${sub}` && c.metric_version === d.version && c.group === group,
      )
    : undefined;

/** People in a group: n + missing of its visible cells (the rows of the group), null when hidden. */
function respondents(cells: readonly ViewCell[], group: string): number | null {
  const n = cells
    .filter((c) => c.group === group)
    .flatMap((c) => (c.suppressed ? [] : [c.n + c.missing]));
  return n.length ? Math.max(...n) : null;
}

/** Shares of the options of one question in one group; all hidden when one option is hidden. */
function bars(cells: readonly ViewCell[], group: string, d: MetricDefinition, q: Choice) {
  const map = d.options_mapping[d.questions[0]!.key] ?? {};
  const parts = q.options.map((o) => at(cells, d, String(map[o.id] ?? o.id), group));
  const visible = parts.flatMap((c) => (c && !c.suppressed ? [c] : []));
  if (visible.length !== parts.length || !visible[0]?.denominator)
    return { n: null, shares: q.options.map(() => null) };
  return { n: visible[0].denominator, shares: visible.map((c) => c.numerator / c.denominator) };
}

const incomparable = (note: string): Comparable => ({ degree: 'incomparable', note });

@Injectable()
export class BeforeAfterView {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: DashboardContext,
    private readonly privacy: PrivacyService,
  ) {}

  /** Snittscore and kritisk andel of one question in one group, when their metrics compare. */
  private score(
    b: DashboardScope,
    a: DashboardScope,
    cellsB: readonly ViewCell[],
    cellsA: readonly ViewCell[],
    q: Choice,
    x: Choice,
    group: string,
  ) {
    const [mb, ma] = pick(
      defsOf(b, cellsB, 'mean_score', q.id),
      defsOf(a, cellsA, 'mean_score', x.id),
    );
    const [cb, ca] = pick(
      defsOf(b, cellsB, 'critical_share', q.id),
      defsOf(a, cellsA, 'critical_share', x.id),
    );
    const changed = questionChange(q, x);
    const comparable = changed
      ? incomparable(changed)
      : worst(metricLink(mb, ma), metricLink(cb, ca));
    if (comparable.degree === 'incomparable')
      return { comparable, before: null, after: null, change: null, critical_change: null };
    const before = {
      mean: valueOf(at(cellsB, mb, q.id, group)),
      critical: valueOf(at(cellsB, cb, q.id, group)),
    };
    const after = {
      mean: valueOf(at(cellsA, ma, x.id, group)),
      critical: valueOf(at(cellsA, ca, x.id, group)),
    };
    return {
      comparable,
      before,
      after,
      change: change(before.mean, after.mean),
      critical_change: change(before.critical, after.critical, true),
    };
  }

  async load(seminar: string, client?: string) {
    const s = await this.prisma.seminar.findUnique({
      where: { id: seminar },
      include: { clients: { include: { client: true } } },
    });
    if (!s) throw new NotFoundException('Seminaret finst ikkje.');
    const base = { class: 'aggregate' as const, caveats: CAVEATS };
    if (s.round_before_id === null || s.round_after_id === null)
      return {
        ...base,
        ready: false as const,
        missing: { before: s.round_before_id === null, after: s.round_after_id === null },
      };
    const b = await this.context.load(s.round_before_id);
    const a = await this.context.load(s.round_after_id);
    // The database allows nothing else (trigger seminar_round_before_after_type); live never.
    if (b.round.type !== 'regular' || a.round.type !== 'post_seminar')
      throw new NotFoundException('Rundane til seminaret finst ikkje.');
    const own = s.clients.map((c) => c.client).filter((c) => c.kind === 'client');
    const slugs = own.map((c) => c.slug);
    const firstB = await this.privacy.clientGroup(b.round.id, b.defs, slugs);
    const firstA = await this.privacy.clientGroup(a.round.id, a.defs, slugs);
    // Like with like: only clients that answered in both rounds.
    const cohort = firstB.answered.filter((c) => firstA.answered.includes(c));
    const gB =
      cohort.length === firstB.answered.length
        ? firstB
        : await this.privacy.clientGroup(b.round.id, b.defs, cohort);
    const gA =
      cohort.length === firstA.answered.length
        ? firstA
        : await this.privacy.clientGroup(a.round.id, a.defs, cohort);
    const selected = client && client !== 'alle' ? cohort.find((c) => c === client) : undefined;
    if (client && client !== 'alle' && !selected)
      throw new NotFoundException('Kunden har ikkje svart i begge undersøkingane.');
    const group = selected ? `client:${selected}` : 'all';
    const name = (slug: string) => own.find((c) => c.slug === slug)?.name ?? slug;
    const round = (x: DashboardScope) => ({
      id: x.round.id,
      name: x.round.name,
      status: x.round.status,
      source: ['closed', 'archived'].includes(x.round.status) ? 'released' : 'live',
    });

    const qb = choices(b),
      qa = choices(a);
    const match = (q: Choice) =>
      qa.find((x) => x.id === q.id || (!!q.anchor_key && x.anchor_key === q.anchor_key));
    const both = qb.flatMap((q) => {
      const x = match(q);
      return x ? [[q, x] as const] : [];
    });
    // Nobody to compare yet: no questions and no marks (the definitions are read from the cells).
    const questions = (cohort.length ? both : []).map(([q, x]) => {
      const changed = questionChange(q, x);
      const [db, da] = pick(
        defsOf(b, gB.cells, 'distribution', q.id),
        defsOf(a, gA.cells, 'distribution', x.id),
      );
      const comparable = changed ? incomparable(changed) : metricLink(db, da);
      const show = comparable.degree !== 'incomparable' && db && da;
      const score =
        scored(q) && scored(x) ? this.score(b, a, gB.cells, gA.cells, q, x, group) : null;
      return {
        id: x.id,
        label: labelOf(x),
        text: x.texts.text.nn,
        multi: x.type === 'multi',
        comparable,
        options: x.options.map((o) => ({ id: o.id, label: o.texts.text.nn })),
        before: show ? bars(gB.cells, group, db, q) : null,
        after: show ? bars(gA.cells, group, da, x) : null,
        score,
      };
    });

    // Snittscore and kritisk andel of all scored questions: one contract, the same questions.
    const [mb, ma] = pick(defsOf(b, gB.cells, 'mean_score'), defsOf(a, gA.cells, 'mean_score'));
    const [cb, ca] = pick(
      defsOf(b, gB.cells, 'critical_share'),
      defsOf(a, gA.cells, 'critical_share'),
    );
    // The questions a mean counts in a round: those of its definition the round's version has.
    const keys = (x: DashboardScope, d?: MetricDefinition) =>
      d?.questions
        .map((q) => q.key)
        .filter((k) => x.content.questions.some((q) => q.id === k))
        .sort()
        .join('|');
    const altered = questions.filter((q) => q.score?.comparable.degree === 'incomparable');
    const totalComparable =
      cohort.length && (mb || ma)
        ? worst(
            metricLink(mb, ma),
            metricLink(cb, ca),
            keys(b, mb) === keys(a, ma)
              ? SAME
              : incomparable('Snittscoren byggjer på ulike spørsmål i dei to undersøkingane.'),
            altered.length
              ? incomparable(
                  `Spørsmål ${altered.map((q) => q.label).join(', ')} kan ikkje samanliknast, så heller ikkje snittscoren for alle.`,
                )
              : SAME,
          )
        : null;
    const side = (
      cells: readonly ViewCell[],
      m: MetricDefinition | undefined,
      c: MetricDefinition | undefined,
      g: string,
    ) => ({
      respondents: respondents(cells, g),
      mean:
        totalComparable && totalComparable.degree !== 'incomparable'
          ? valueOf(at(cells, m, 'all', g))
          : null,
      critical:
        totalComparable && totalComparable.degree !== 'incomparable'
          ? valueOf(at(cells, c, 'all', g))
          : null,
    });
    const row = (g: string) => {
      const before = side(gB.cells, mb, cb, g),
        after = side(gA.cells, ma, ca, g);
      return {
        before,
        after,
        change: change(before.mean, after.mean),
        critical_change: change(before.critical, after.critical, true),
      };
    };
    return {
      ...base,
      ready: true as const,
      rounds: { before: round(b), after: round(a) },
      client: selected ?? null,
      cohort: cohort.map((slug) => ({ slug, name: name(slug) })),
      not_both: own
        .filter((c) => !cohort.includes(c.slug))
        .map((c) => ({
          name: c.name,
          before: firstB.answered.includes(c.slug),
          after: firstA.answered.includes(c.slug),
        })),
      total: { comparable: totalComparable, ...row(group) },
      clients: selected
        ? []
        : cohort.map((slug) => ({ slug, name: name(slug), ...row(`client:${slug}`) })),
      questions,
      only_before: qb.filter((q) => !match(q)).map(labelOf),
      only_after: qa.filter((x) => !both.some(([, y]) => y === x)).map(labelOf),
    };
  }
}
export type BeforeAfterModel = Awaited<ReturnType<BeforeAfterView['load']>>;
