// Hashes of the ADR-018 triple (prompt_hash, model, briefs_version) and of the output schema.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { surveyDraftJsonSchema } from '@varde/schema/survey-draft';

export const sha256 = (data: string | Buffer): string =>
  createHash('sha256').update(data).digest('hex');

/** First 12 hex digits: directory names under runs/ and output ids in score sheets. */
export const short = (hash: string): string => hash.slice(0, 12);

/** prompt_hash = sha256 of the prompt file. */
export const promptHash = (file: string): string => sha256(readFileSync(file));

/** Brief names (file names without `.md`), sorted. */
export function briefNames(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -3))
    .sort();
}

/** briefs_version = sha256 over the sorted `name.md` and sha256 of each brief file. */
export function briefsVersion(dir: string): string {
  const lines = briefNames(dir).map(
    (name) => `${name}.md\0${sha256(readFileSync(join(dir, `${name}.md`)))}\n`,
  );
  return sha256(lines.join(''));
}

/** Hash of the JSON Schema sent as `output_config.format` (recorded with every run). */
export const schemaHash = (): string => sha256(JSON.stringify(surveyDraftJsonSchema()));
