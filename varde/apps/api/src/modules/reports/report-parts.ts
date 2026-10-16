// Pure parts of the client report (5.1, ADR-025): language choice, numbers from released
// aggregate cells, saved findings in dashboard order, comparability between two rounds.
// Inputs are ViewCells (class `aggregate`) and Finding rows; nothing here sees response rows.
import type { MetricDefinition } from '@varde/schema/metrics/metric-definition';
import type { Question } from '@varde/schema/template/question';
import type { TemplateContent } from '@varde/schema/template/template';
import type { FindingRule } from '../findings/finding-rule.js';
import type { ViewCell } from '../privacy/privacy.service.js';
import { cellAt, valueOf } from '../dashboard/aggregate-view.js';

export type ReportLang = 'nn' | 'en' | 'nb';

const OSLO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Oslo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
/** Day (YYYY-MM-DD) in Norway: the report speaks of local days, not UTC days. */
export const osloDay = (d: Date): string => OSLO.format(d);
export type Degree = 'comparable' | 'approximate' | 'incomparable';

/** nn and en always (client surveys); nb only when the version has bokmål on (ADR-019). */
export function reportLanguages(versionLanguages: readonly string[]): ReportLang[] {
  return versionLanguages.includes('nb') ? ['nn', 'en', 'nb'] : ['nn', 'en'];
}

/** The client's language when the version has it, otherwise nn (ADR-019). */
export function defaultLanguage(available: readonly ReportLang[], clientLang: string): ReportLang {
  return available.find((l) => l === clientLang) ?? 'nn';
}

/** Rule texts exist in nn and en; a bokmål report shows them in nn (marked `lang`). */
export const ruleLang = (lang: ReportLang): 'nn' | 'en' => (lang === 'en' ? 'en' : 'nn');

const visible = (c: ViewCell | undefined): c is Extract<ViewCell, { suppressed: false }> =>
  c !== undefined && !c.suppressed;

export interface ScoreStats {
  mean: number | null;
  critical: number | null;
  zone: number | null;
}

/** Zone metrics of the version (kinds of ADR-026); absent for templates without scores. */
export function scoreDefs(defs: readonly MetricDefinition[]) {
  const of = (kind: MetricDefinition['kind']) =>
    defs.find((d) => d.kind === kind && d.part === 'common');
  return { mean: of('mean_score'), critical: of('critical_share'), zone: of('zone') };
}

export function scoreStats(
  cells: readonly ViewCell[],
  defs: ReturnType<typeof scoreDefs>,
  suffix = 'all',
): ScoreStats {
  const at = (d: MetricDefinition | undefined) =>
    d ? valueOf(cellAt(cells, `${d.key}.${suffix}`)) : null;
  return { mean: at(defs.mean), critical: at(defs.critical), zone: at(defs.zone) };
}

/** Respondents of the client: persons of the role question (as the dashboard), else of the
 * score; null when the cell is hidden (n < k). */
export function respondents(
  cells: readonly ViewCell[],
  defs: readonly MetricDefinition[],
  content: TemplateContent,
): number | null {
  const role = content.questions.find((q) => q.role && q.part === 'common');
  const first = (d: MetricDefinition) => {
    const q = d.questions[0]?.key ?? '';
    const bucket = Object.values(d.options_mapping[q] ?? {})[0];
    return bucket === undefined ? [] : [`${d.key}.${String(bucket)}`];
  };
  const distributions = defs.filter((d) => d.kind === 'distribution' && d.part === 'common');
  const mean = scoreDefs(defs).mean;
  const keys = [
    ...distributions.filter((d) => d.questions[0]?.key === role?.id).flatMap(first),
    ...(mean ? [`${mean.key}.all`] : []),
    ...distributions.filter((d) => d.questions[0]?.key !== role?.id).flatMap(first),
  ];
  for (const key of keys) {
    const c = cellAt(cells, key);
    if (visible(c)) return c.n + c.missing;
  }
  return null;
}

export function questionLabel(q: Question, lang: ReportLang): string {
  const t = q.texts;
  return t.short_label?.[lang] ?? t.text[lang] ?? t.short_label?.nn ?? t.text.nn;
}

/** Common questions with scores: the rows of «Spørsmål for spørsmål». */
export const scoredQuestions = (content: TemplateContent) =>
  content.questions.filter(
    (q) => q.part === 'common' && 'options' in q && q.options.some((o) => o.score !== undefined),
  );

export interface SavedNumbers {
  n: number;
  count: number;
  share: number;
  level: 'medium' | 'high';
}

/** Dashboard order (findings/evaluate.ts): high first, then larger share, then rule order. */
export function byDashboardOrder(
  a: { numbers: SavedNumbers; rule: FindingRule },
  b: { numbers: SavedNumbers; rule: FindingRule },
): number {
  return (
    (a.numbers.level === b.numbers.level ? 0 : a.numbers.level === 'high' ? -1 : 1) ||
    b.numbers.share - a.numbers.share ||
    a.rule.order - b.rule.order
  );
}

const WORDS = {
  nn: { of: 'av', hours: 'timar/veke', person: 'person', persons: 'personar' },
  en: { of: 'of', hours: 'hours/week', person: 'person', persons: 'people' },
} as const;

/** Text of one saved finding in the rule language; computed KI findings fill their
 * placeholders from the saved numbers and the released task cells, as the dashboard does. */
export function findingText(
  rule: FindingRule,
  numbers: SavedNumbers,
  lang: ReportLang,
  cells: readonly ViewCell[],
  content: TemplateContent,
): { tal: string; text: string; action: string } {
  const l = ruleLang(lang);
  const w = WORDS[l];
  const action = rule.action_text[l];
  if (rule.computed === 'routine' || rule.computed === 'heaviest') {
    const tal = `≈ ${Math.round(numbers.count)} ${w.hours}`;
    // Every occurrence, as evaluate() fills them in the dashboard (2.5 allows edited texts).
    let text = rule.text[l].replaceAll('{n}', String(numbers.n));
    if (rule.computed === 'heaviest') {
      const top = cells
        .filter((c) => c.group === 'all' && c.metric_key.startsWith(`${rule.metric_key}.`))
        .filter(visible)
        .sort((a, b) => b.numerator - a.numerator || b.n - a.n)[0];
      const task = content.questions.find((q) => q.id === 'K16');
      const option =
        task && 'options' in task
          ? task.options.find((o) => o.id === top?.metric_key.split('.').at(-1))
          : undefined;
      const label = option ? (option.texts.text[l] ?? option.texts.text.nn) : '';
      text = text
        .replaceAll('{task}', label.toLowerCase())
        .replaceAll('{persons}', numbers.n === 1 ? w.person : w.persons);
    }
    return { tal, text, action };
  }
  return { tal: `${numbers.count} ${w.of} ${numbers.n}`, text: rule.text[l], action };
}

const RANK: Record<Degree, number> = { comparable: 2, approximate: 1, incomparable: 0 };

/** Comparability of one metric between two rounds (ADR-020): the same key@version is
 * comparable; otherwise the declared link in either direction; nothing declared → incomparable. */
export function degreeOf(now: MetricDefinition | undefined, before: MetricDefinition | undefined) {
  if (!now || !before) return 'incomparable' as const;
  if (now.key === before.key && now.version === before.version) return 'comparable' as const;
  const link =
    now.comparability.find((c) => c.to === `${before.key}@${before.version}`) ??
    before.comparability.find((c) => c.to === `${now.key}@${now.version}`);
  return link?.degree ?? 'incomparable';
}

/** The weakest degree over the zone metrics decides what the report may compare. */
export function weakest(degrees: readonly Degree[]): Degree {
  return degrees.reduce<Degree>((w, d) => (RANK[d] < RANK[w] ? d : w), 'comparable');
}
