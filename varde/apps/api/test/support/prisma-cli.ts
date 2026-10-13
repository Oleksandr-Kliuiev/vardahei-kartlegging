import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const API_DIR = join(__dirname, '..', '..');
const CLI = join(API_DIR, 'node_modules', 'prisma', 'build', 'index.js');

export interface CliResult {
  status: number | null;
  output: string;
}

/** Runs the Prisma CLI of apps/api (same entry as in the production image). */
export function prisma(args: string[], databaseUrl: string): CliResult {
  const run = spawnSync(process.execPath, [CLI, ...args], {
    cwd: API_DIR,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: databaseUrl, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '')
    throw new Error('DATABASE_URL is required for integration tests');
  return url;
}

/** Same server and credentials, another database name. */
export function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}
