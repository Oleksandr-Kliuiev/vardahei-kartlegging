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
}

/** A template with its versions, as `GET /api/admin/surveys` lists them. */
export interface SurveySummary {
  id: string;
  key: string;
  audience: string;
  versions: { id: string; label: string; version_no: number; status: string }[];
}
