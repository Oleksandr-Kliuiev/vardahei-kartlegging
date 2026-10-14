import { createHash } from 'node:crypto';

/** ADR-024: hash the original (k, init) archive identity, without normalization.
 * @param {string} k
 * @param {string} init
 * @returns {string}
 */
export const runde1SourceId = (k, init) =>
  createHash('sha256').update(`runde1|${k}|${init}`).digest('hex');
