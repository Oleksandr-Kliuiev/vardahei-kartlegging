import { fileURLToPath } from 'node:url';

/** Absolute path of `varde/` (workspace root). */
export const VARDE_DIR = fileURLToPath(new URL('../../../', import.meta.url));
/** Absolute path of the repository root. */
export const REPO_DIR = fileURLToPath(new URL('../../../../', import.meta.url));
