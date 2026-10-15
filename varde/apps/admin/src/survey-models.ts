import type { TemplateContent } from '../../../packages/schema/src/template/template.js';

export interface EditorVersion {
  id: string;
  template_id: string;
  label: string;
  status: string;
  content_hash: string;
  content: TemplateContent;
  required_languages: string[];
  translation_acceptance: Record<string, unknown>;
}
