// Seed files from sporsmal.js (1.2): templates, clients and the import map. `writeSeed` writes
// them into a directory; `diffSeed` compares two directories file by file (`--check`).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TemplateContent } from '@varde/schema/template/template';
import { convertSkjema } from './convert.js';
import type { Kartlegging } from './kartlegging.js';
import { loadKartlegging } from './load.js';

export interface SeedTemplate {
  label: string;
  origin: 'kartlegging';
  /** `KARTLEGGING.versjon` of the source file. */
  source_versjon: string;
  content: TemplateContent;
}

/** versjon of a kartlegging row → template key@label (1a.md 1.2 step 3). */
export const IMPORT_MAP = {
  tryggleik: { '2026-10-12': 'tryggleik@2026-10-13', '2026-10-13': 'tryggleik@2026-10-13' },
  ki: { '2026-10-12': 'ki@2026-10-12', '2026-10-13': 'ki@2026-10-13' },
} as const;

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export function seedFiles(current: Kartlegging, old: Kartlegging): Map<string, string> {
  const files = new Map<string, string>();
  const tpl = (k: Kartlegging, id: string, label: string): SeedTemplate => ({
    label,
    origin: 'kartlegging',
    source_versjon: k.versjon,
    content: convertSkjema(k, id),
  });
  files.set('templates/tryggleik.2026-10-13.json', json(tpl(current, 'tryggleik', '2026-10-13')));
  files.set('templates/ki.2026-10-13.json', json(tpl(current, 'ki', '2026-10-13')));
  files.set('templates/ki.2026-10-12.json', json(tpl(old, 'ki', '2026-10-12')));
  files.set(
    'clients.json',
    json(Object.entries(current.kundar).map(([slug, name]) => ({ slug, name }))),
  );
  files.set('import-map.json', json(IMPORT_MAP));
  return files;
}

export function seedFromSources(currentSrc: string, oldSrc: string): Map<string, string> {
  return seedFiles(loadKartlegging(currentSrc), loadKartlegging(oldSrc));
}

export function writeSeed(dir: string, files: Map<string, string>): void {
  for (const [rel, body] of files) {
    const full = join(dir, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
}

/** Differences between generated files and `dir` (missing, changed, or extra in templates/). */
export function diffSeed(dir: string, files: Map<string, string>): string[] {
  const out: string[] = [];
  for (const [rel, body] of files) {
    const full = join(dir, rel);
    if (!existsSync(full)) out.push(`missing ${rel}`);
    else if (readFileSync(full, 'utf8') !== body) out.push(`changed ${rel}`);
  }
  const templates = join(dir, 'templates');
  if (existsSync(templates)) {
    for (const name of readdirSync(templates)) {
      if (!files.has(`templates/${name}`)) out.push(`extra templates/${name}`);
    }
  }
  return out;
}
