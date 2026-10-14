// Hashes of a template version (1.5): `content_hash` over the canonical content and
// `source_hash` over the nn source texts (ADR-019: changing a text resets acceptances).
import { createHash } from 'node:crypto';
import type { TemplateContent } from '@varde/schema/template/template';
import { templateTexts } from '@varde/schema/template/validate';

/** JSON with sorted object keys (stable across key order). */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

export const contentHash = (content: unknown): string => sha256(canonical(content));

/** sha256 of the nn texts with their paths: the source every translation is accepted against. */
export function sourceHash(content: TemplateContent): string {
  return sha256(canonical(templateTexts(content).map((t) => [t.path.join('.'), t.text.nn])));
}
