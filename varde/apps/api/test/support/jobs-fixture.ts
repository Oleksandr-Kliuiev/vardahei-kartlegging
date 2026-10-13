// Temporary config dir for job tests: the real db-budget.json plus a jobs.json override.
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configDir } from '../../src/config/config-dir.js';

export function jobsConfigDir(jobs: object): string {
  const dir = mkdtempSync(join(tmpdir(), 'varde-jobs-'));
  copyFileSync(join(configDir({}), 'db-budget.json'), join(dir, 'db-budget.json'));
  writeFileSync(join(dir, 'jobs.json'), JSON.stringify(jobs));
  return dir;
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Polls `read` every 250 ms until `done` holds or `timeoutMs` passes. */
export async function until<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs = 45_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) return value;
    await sleep(250);
  }
}
