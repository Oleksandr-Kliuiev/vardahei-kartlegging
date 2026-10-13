import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root (parent of varde/ and docs/). */
export const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

export function readDoc(rel: string): string {
  return readFileSync(join(REPO, rel), 'utf8');
}

/** Rows of every markdown table in `text` (header and separator rows excluded). */
export function tableRows(text: string): string[] {
  const rows: string[] = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (!line.startsWith('|')) return;
    if (/^\|[\s:|-]+\|$/.test(line)) return;
    if (/^\|[\s:|-]+\|$/.test(lines[i + 1] ?? '')) return;
    rows.push(line);
  });
  return rows;
}
