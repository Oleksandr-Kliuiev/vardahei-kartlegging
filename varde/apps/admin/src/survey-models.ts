import type { TemplateContent } from '../../../packages/schema/src/template/template.js';

export interface EditorVersion {
  id: string;
  template_id: string;
  label: string;
  version_no: number;
  status: string;
  created_at?: string;
  published_at?: string | null;
  content_hash: string;
  content: TemplateContent;
  required_languages: string[];
  translation_acceptance: Record<string, unknown>;
  /** What each language was approved on (2.16): the texts at the last approval, by text key. */
  acceptance_basis?: Record<string, ApprovalBasis | undefined>;
  published_by?: string | null;
  /** Names of who approved and published, by the id AuditLog keeps. */
  people?: Record<string, string>;
}
export interface ApprovalBasis {
  at: string;
  by: string;
  texts: Record<string, Partial<Record<'nn' | 'en' | 'nb', string>>>;
}

export interface VersionSummary {
  id: string;
  label: string;
  version_no: number;
  status: string;
  created_at?: string;
  published_at?: string | null;
  /** The name of who published it. */
  published_by?: string | null;
  /** Rounds that use this version. */
  rounds?: number;
}
/** A survey in the library (2.16), as `GET /api/admin/surveys` lists them. */
export interface SurveySummary {
  id: string;
  key: string;
  audience: string;
  title?: string;
  question_count?: number;
  languages?: string[];
  rounds?: number;
  /** The open draft and what is left before it can be published. */
  draft?: { id: string; version_no: number; left: number } | null;
  versions: VersionSummary[];
}

export const AUDIENCE: Record<string, string> = {
  client_survey: 'Undersøking hos kundar',
  seminar_live: 'Spørsmål på seminaret',
  seminar_after: 'Etter seminaret',
};
