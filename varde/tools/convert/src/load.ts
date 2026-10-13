// Loads kartlegging's question bank the way kartlegging/server.js 32–36 does: the file runs in
// a vm context with an empty `window` and leaves `window.KARTLEGGING`.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import vm from 'node:vm';
import type { Kartlegging } from './kartlegging.js';

export function loadKartlegging(source: string): Kartlegging {
  const window: { KARTLEGGING?: Kartlegging } = {};
  vm.runInNewContext(source, { window }, { timeout: 1000 });
  if (window.KARTLEGGING === undefined)
    throw new Error('sporsmal.js did not set window.KARTLEGGING');
  return window.KARTLEGGING;
}

export function loadFile(path: string): Kartlegging {
  return loadKartlegging(readFileSync(path, 'utf8'));
}

/** Revision of sporsmal.js with KI 2026-10-12 (anonymous, without K0). */
export const OLD_REVISION = 'f26ee21';

/** `git show <rev>:kartlegging/public/sporsmal.js` from the repository of `nearPath`. */
export function gitSource(nearPath: string, rev = OLD_REVISION): string {
  const top = execFileSync('git', ['-C', dirname(nearPath), 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
  return execFileSync('git', ['-C', top, 'show', `${rev}:kartlegging/public/sporsmal.js`], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}
