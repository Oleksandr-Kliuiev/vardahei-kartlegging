// Identity of imported parts (1.8, ADR-006, ADR-024): submission_id = uuidv5(NS_IMPORT,
// source_id + ':' + part) — stable across re-imports; content_hash = sha256 of the canonical part.
import { createHash } from 'node:crypto';
import { canonical, sha256 } from '../surveys/hashes.js';

/** Namespace of imported kartlegging parts (fixed; never change it). */
export const NS_IMPORT = '5d0c6f63-3b2e-4a59-9a0f-6b1d1a7c2e01';

export function uuidv5(namespace: string, name: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const h = createHash('sha1')
    .update(Buffer.concat([ns, Buffer.from(name, 'utf8')]))
    .digest();
  h[6] = ((h[6] ?? 0) & 0x0f) | 0x50;
  h[8] = ((h[8] ?? 0) & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const importSubmissionId = (sourceId: string, part: string): string =>
  uuidv5(NS_IMPORT, `${sourceId}:${part}`);

export const partHash = (part: object): string => sha256(canonical(part));
