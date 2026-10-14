// config/seed of the repository and its template files (1.5, 1.7).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { API_DIR } from './prisma-cli.js';

export const SEED_DIR = join(API_DIR, '..', '..', 'config', 'seed');
export const FIXTURES_DIR = join(API_DIR, '..', '..', 'tools', 'parity', 'fixtures');

export function seedContent(
  name: string,
): Record<string, unknown> & { key: string; questions: Record<string, unknown>[] } {
  const file = JSON.parse(readFileSync(join(SEED_DIR, 'templates', `${name}.json`), 'utf8')) as {
    content: Record<string, unknown> & { key: string; questions: Record<string, unknown>[] };
  };
  return file.content;
}
