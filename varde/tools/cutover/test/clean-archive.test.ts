import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { cleanArchive } from '../clean-archive.mjs';

const a = { id: 'synthetic-a', svar: { F12: 'ja' }, fri: {}, leiardel: false };
const b = {
  id: 'synthetic-b',
  svar: { F12: 'nei', B13: 'ja', L1: 'ja' },
  fri: { B13: 'synthetic', L1: 'synthetic' },
  leiardel: true,
};
const runde1 =
  'window.RUNDE1={namn:"Runde 1 (Forms)",dato:"2026-01",svar:[{k:"synthetic",init:"ZZTEST",svar:{F12:"ja"}}]};';
const tombstones = [
  { source_id: a.id, part: 'common' },
  { source_id: b.id, part: 'leader' },
  {
    source_id: createHash('sha256').update('runde1|synthetic|ZZTEST').digest('hex'),
    part: 'common',
  },
];
it('deletes common, strips leader in both surveys and preserves source ID', () => {
  const r = cleanArchive(tombstones, [a, b].map((r) => JSON.stringify(r)).join('\n'), runde1);
  expect(r.counts).toEqual({ common: 1, leader: 1, runde1: 1 });
  expect(JSON.parse(r.svar)).toEqual({ ...b, leiardel: false, svar: { F12: 'nei' }, fri: {} });
  const ctx = { window: { RUNDE1: { svar: [] } } };
  runInNewContext(r.runde1, ctx);
  expect(ctx.window.RUNDE1.svar).toEqual([]);
});
it('second cleaning is byte-for-byte idempotent and removes nothing', () => {
  const r = cleanArchive(tombstones, [a, b].map((r) => JSON.stringify(r)).join('\n'), runde1);
  const twice = cleanArchive(tombstones, r.svar, r.runde1);
  expect(twice.counts).toEqual({ common: 0, leader: 0, runde1: 0 });
  expect(twice.svar).toBe(r.svar);
  expect(twice.runde1).toBe(r.runde1);
});
