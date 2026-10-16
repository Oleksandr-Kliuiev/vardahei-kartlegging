// FindingRule editor (2.5): shapes of /api/admin/finding-rules and the Nynorsk words the page uses.
export type Family = 'tryggleik' | 'ki';
export type Channel = 'aggregate' | 'leader';
export type Level = 'medium' | 'high';
export interface Texts {
  nn: string;
  en: string;
}
export interface Rule {
  key: string;
  version: number;
  channel: Channel;
  metric_key: string;
  question?: string;
  options: string[];
  raw_options?: string[];
  basis: string;
  threshold: { medium: number; high: number };
  min_count: number;
  text: Texts;
  action_text: Texts;
  severity: 'risk' | 'opportunity';
  level?: Level;
  computed?: 'routine' | 'heaviest' | 'f12_b13';
  minimum_hours?: number;
  order: number;
}
export interface QuestionRef {
  id: string;
  label: string;
}
export interface RuleSummary {
  key: string;
  version: number;
  versions: number;
  rule: Rule;
  questions: QuestionRef[];
}
export interface Choice {
  id: string;
  label: string;
  group?: string;
}
export interface RuleDetail {
  key: string;
  rule: Rule;
  choices: Choice[];
  locked: boolean;
  countsAnswers: boolean;
  questions: QuestionRef[];
  placeholders: string[];
  versions: { version: number; created_at: string; changed: string[]; rule: Rule }[];
}
export type Outcome =
  | { kind: 'finding'; level: Level; tal: string; share: number | null }
  | { kind: 'none'; tal: string | null; share: number | null }
  | { kind: 'hidden' }
  | { kind: 'empty' };
export interface Preview {
  round: { id: string; name: string; status: string };
  client: string | null;
  source: 'live' | 'released';
  fixed_version: number | null;
  audited: boolean;
  current: { version: number; outcome: Outcome };
  draft: { outcome: Outcome };
}

/** Round and client of the preview; kept per questionnaire while one moves between rules. */
export interface PreviewScope {
  round: string;
  client: string;
}

/** The fields that decide whether a rule fires: only these go to the preview. */
export const EVAL_FIELDS = ['options', 'threshold', 'min_count', 'level', 'minimum_hours'] as const;
export const evalPart = (r: Rule) =>
  Object.fromEntries(EVAL_FIELDS.filter((f) => r[f] !== undefined).map((f) => [f, r[f]]));

export const familyOf = (key: string): Family => (key.startsWith('ki.') ? 'ki' : 'tryggleik');
export const percent = (share: number) => `${Math.round(share * 100)} %`;
export const levelName = (severity: Rule['severity'], level: Level) =>
  severity === 'opportunity'
    ? level === 'high'
      ? 'Stor'
      : 'Verdt'
    : level === 'high'
      ? 'Høg'
      : 'Middels';
/** Readable rule text: placeholders that the dashboard fills are shown as «…». */
export const plain = (text: string) => text.replace(/\{[a-z_]+\}/g, '…');

/** When a rule fires, in a few words (list and versions). */
export function summary(r: Rule): string {
  if (r.computed === 'routine') return 'Rekna ut frå timar i veka';
  if (r.computed === 'heaviest')
    return `Rekna ut frå timar, minst ${r.minimum_hours ?? 1} t i veka`;
  if (r.computed === 'f12_b13')
    return `Frå ${percent(r.threshold.medium)} som veit, minst ${r.min_count} svar`;
  if (r.channel === 'leader')
    return `Leiarsvar, nivå ${levelName(r.severity, r.level ?? 'medium').toLowerCase()}`;
  return `Middels frå ${percent(r.threshold.medium)}, høg frå ${percent(r.threshold.high)}, minst ${r.min_count}`;
}

/** How the dashboard shows the finding text, with made-up numbers. */
export function example(r: Rule): string {
  const text = plain(r.text.nn);
  if (r.computed === 'routine') return `≈ 12 timar/veke ${text}`;
  if (r.computed === 'heaviest') return `≈ 4 timar/veke ${text}`;
  if (r.computed === 'f12_b13') return `67 % ${text}`;
  return r.channel === 'leader' ? `Leiaren ${text}` : `4 av 12 ${text}`;
}

/** «4 av 12 (33 %)»: the numbers a version saw, without a level. */
export function numbers(o: Outcome): string {
  if (o.kind === 'hidden') return 'Skjult: færre enn 3 svar';
  if (o.kind === 'empty') return 'Ingen svar å rekne på';
  if (o.tal === null) return 'Ingen tal';
  return o.share === null ? o.tal : `${o.tal} (${percent(o.share)})`;
}

/** What changed between two versions, in words (field names come from the API). */
export const FIELD_NAMES: Record<string, string> = {
  text: 'funnet',
  action_text: 'kva vi gjer',
  threshold: 'tersklar',
  min_count: 'minst personar',
  options: 'svar som tel',
  severity: 'type',
  level: 'nivå',
  minimum_hours: 'minst timar',
  order: 'rekkjefølgje',
};

/** The editor's own check before saving; the server checks the same and more. */
export function problems(draft: Rule, detail: RuleDetail): string[] {
  const out: string[] = [];
  const texts = [draft.text.nn, draft.text.en, draft.action_text.nn, draft.action_text.en];
  if (texts.some((t) => !t.trim())) out.push('Skriv teksten både på nynorsk og engelsk.');
  // Only the finding text gets its placeholders filled; «Kva vi gjer» is shown as written.
  texts.forEach((t, i) => {
    for (const m of t.matchAll(/\{([^}]*)\}/g))
      if (i > 1 || !detail.placeholders.includes(m[1] ?? ''))
        out.push(`Teksten har ein ukjend plasshaldar: {${m[1] ?? ''}}.`);
  });
  const { medium, high } = draft.threshold;
  if (!(medium >= 0 && medium <= high && high <= 1))
    out.push('«Høg» kan ikkje vere lågare enn «middels», og begge må vere mellom 0 og 100 %.');
  if (!Number.isInteger(draft.min_count) || draft.min_count < 1)
    out.push('«Minst» må vere eit heilt tal frå 1.');
  if (draft.minimum_hours !== undefined && !(draft.minimum_hours >= 0))
    out.push('«Minst timar i veka» må vere eit tal frå 0.');
  if (detail.countsAnswers && !detail.locked && draft.options.length === 0)
    out.push('Vel minst eitt svar som skal telje.');
  return [...new Set(out)];
}
