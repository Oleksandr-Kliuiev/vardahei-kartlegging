// Sources for the converter tests: the current sporsmal.js and the f26ee21 revision (git).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gitSource, loadKartlegging } from '../src/load.js';

export const SPORSMAL = fileURLToPath(
  new URL('../../../../kartlegging/public/sporsmal.js', import.meta.url),
);
export const SEED_DIR = fileURLToPath(new URL('../../../config/seed', import.meta.url));
export const VARDE_DIR = fileURLToPath(new URL('../../../', import.meta.url));

export const currentSrc = readFileSync(SPORSMAL, 'utf8');
export const oldSrc = gitSource(SPORSMAL);
export const current = loadKartlegging(currentSrc);
export const old = loadKartlegging(oldSrc);
