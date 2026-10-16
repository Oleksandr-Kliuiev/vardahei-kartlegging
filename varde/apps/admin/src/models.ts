export interface Client {
  id: string;
  name: string;
  slug: string;
  employee_count: number | null;
}
export interface RoundClient {
  id: string;
  client_id: string;
  client: { name: string };
  status: string;
  deadline: string | null;
  population_snapshot: number | null;
  /** Released round_client snapshots exist (5.1: a client report can be made). */
  released?: boolean;
}
export interface Round {
  id: string;
  name: string;
  /** regular, post_seminar (3.8: the survey after a seminar) or external_import. */
  type?: string;
  status: string;
  template_version_id: string | null;
  round_clients: RoundClient[];
}
export interface Version {
  id: string;
  label: string;
  template: { key: string };
}
export interface Audit {
  who: string;
  what: string;
  at: string;
  target: string | null;
}
export interface Invitation {
  languages?: string[];
  lang: string;
  text: string;
  link: string;
}
export type Cell = { suppressed: true } | { suppressed: false; value: number };
export interface Progress {
  round_client_id: string;
  population_snapshot: number | null;
  responses_total: number;
  last_response_day: string | null;
  in_progress: Cell;
  abandoned: Cell;
  started: Cell;
  median_duration_s: Cell;
  stopped: Record<string, Cell>;
}
