// .env example rules shared by 0.4b (no-secrets-in-examples) and 0.12b (0b-env-example):
// names only, no values, except the explicit allow-list.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const ALLOWED_VALUES = new Set([
  'PORT=3000',
  'VARDE_BREAK_GLASS_SOCKET=/run/varde/break-glass.sock',
]);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.selfcheck']);

export function exampleFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...exampleFiles(full));
    } else if (entry.name === '.env.example' || entry.name.endsWith('.env.example')) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Returns offending lines: `KEY=value` outside the allow-list, anything not `KEY=`, and
 * commented-out values (`# KEY=value`).
 */
export function violations(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) => line !== '' && !(line.startsWith('#') && !/^#\s*[A-Z][A-Z0-9_]*=\S/.test(line)),
    )
    .filter((line) => !/^[A-Z][A-Z0-9_]*=$/.test(line) && !ALLOWED_VALUES.has(line));
}
