// Question banks of kartlegging for the parity tools (1.2b, 1.2c): the current sporsmal.js and
// the f26ee21 revision (KI 2026-10-12 without K0), loaded through vm as kartlegging/server.js does.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const REPO = fileURLToPath(new URL('../../../', import.meta.url));
export const KARTLEGGING = fileURLToPath(new URL('../../../kartlegging/', import.meta.url));
export const OLD_REVISION = 'f26ee21';

export function loadBank(source) {
  const window = {};
  vm.runInNewContext(source, { window }, { timeout: 1000 });
  return window.KARTLEGGING;
}

export function currentBank() {
  return loadBank(readFileSync(`${KARTLEGGING}public/sporsmal.js`, 'utf8'));
}

export function oldBank() {
  const src = execFileSync(
    'git',
    ['-C', REPO, 'show', `${OLD_REVISION}:kartlegging/public/sporsmal.js`],
    {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  return loadBank(src);
}
