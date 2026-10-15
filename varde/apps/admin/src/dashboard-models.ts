export type MetricCell =
  | { suppressed: true }
  | {
      suppressed: false;
      n: number;
      numerator: number;
      denominator: number;
      missing: number;
      stale?: boolean;
    };
export interface Stats {
  mean: number | null;
  critical: number | null;
  zone: number | null;
  n: number | null;
}
export interface Bucket {
  id: string;
  label: string;
  score: number | null;
  cell: MetricCell;
}
export interface QuestionView {
  id: string;
  label: string;
  short_label: string;
  type: string;
  series: {
    key: string;
    label: string;
    n: number | null;
    buckets: Bucket[];
    mean: number | null;
    nps: number | null;
  }[];
}
export interface Finding {
  key: string;
  /** Rule version the finding was computed with; a closed round keeps it (2.5). */
  version?: number;
  latest_version?: number;
  n: number;
  count: number;
  share: number;
  level: 'medium' | 'high';
  text: string;
  action: string;
  severity: string;
  tal: string;
}
export interface Dashboard {
  template: string;
  mode: string;
  source: string;
  roles: { id: string; label: string }[];
  suppression_note: string;
  findings: Finding[];
  zones:
    | (Stats & {
        questions: (Stats & { id: string; label: string })[];
        persons: { id: string; cell: MetricCell | null }[];
        grid: (Stats & {
          id: string;
          label: string;
          questions: (Stats & { id: string; label: string })[];
        })[];
      })
    | null;
  key_questions: (QuestionView & Stats)[];
  questions: QuestionView[];
  ki: {
    routine_hours: MetricCell | null;
    tasks: { id: string; label: string; cell: MetricCell; total: MetricCell | null }[];
  } | null;
}
export interface Employees {
  template: string;
  client: string | null;
  previous_round: { id: string; name: string } | null;
  columns: { id: string; label: string }[];
  summary: { matched: number; better: number; worse: number; same: number };
  rows: {
    submission_id: string;
    respondent_key: string;
    role: string;
    client: string;
    client_name: string;
    mean: number | null;
    zone: number | null;
    marked: { id: string; label: string; score: number }[];
    columns: { id: string; label: string; marked: boolean }[];
    previous: {
      mean: number | null;
      zone: number | null;
      label: string | null;
      change: string | null;
    } | null;
  }[];
}
export interface Quotes {
  quotes: {
    submission_id: string;
    question: string;
    label: string;
    text: string;
    client: string;
    client_name: string;
    role?: string;
  }[];
}
export interface Leader {
  client_name: string;
  columns: { id: string; label: string }[];
  table: { submission_id: string; cells: string[]; signals: string[] }[];
  rows: {
    submission_id: string;
    role: string;
    answers: Record<string, unknown>;
    free: Record<string, unknown>;
    display: Record<string, string>;
  }[];
  questions: { id: string; label: string }[];
  findings: Finding[];
}
export interface LeaderSummary {
  questions: QuestionView[];
  findings: Finding[];
}
export interface Comparison {
  note: string;
  not_yet: string[];
  clients: ComparisonRow[];
  questions: ComparisonRow[];
  total: ComparisonRow;
}
export interface ComparisonRow {
  id: string;
  label: string;
  before: Stats;
  now: Stats;
  change: { delta: number; kind: string } | null;
  critical_change: { delta: number; kind: string } | null;
}
export const numberText = (x: number | null | undefined, digits = 2) =>
  x == null ? '–' : x.toFixed(digits).replace('.', ',');
export const percent = (x: number | null | undefined) =>
  x == null ? '–' : `${Math.round(x * 100)} %`;
export const zoneNames = ['Grøn', 'Gul', 'Oransje', 'Raud'];
export const zoneIds = ['gron', 'gul', 'oransje', 'raud'];
