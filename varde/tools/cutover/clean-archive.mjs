#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

export const runde1Key = (k, init) =>
  createHash('sha256').update(`runde1|${k}|${init.trim().toUpperCase()}`).digest('hex');
/** Identity is permanent id, never the hash of a mutable response. */
export function cleanArchive(tombstones, svar, runde1) {
  const common = new Set(tombstones.filter((t) => t.part === 'common').map((t) => t.source_id));
  const leader = new Set(tombstones.filter((t) => t.part === 'leader').map((t) => t.source_id));
  const counts = { common: 0, leader: 0, runde1: 0 };
  const rows = svar
    .trim()
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      const r = JSON.parse(line);
      if (common.has(r.id)) {
        counts.common++;
        return [];
      }
      if (leader.has(r.id)) {
        const had =
          r.leiardel ||
          Object.keys(r.svar ?? {}).some((id) => /^(B\d|L\d)/.test(id)) ||
          Object.keys(r.fri ?? {}).some((id) => /^(B\d|L\d)/.test(id));
        r.leiardel = false;
        for (const field of ['svar', 'fri'])
          if (r[field])
            r[field] = Object.fromEntries(
              Object.entries(r[field]).filter(([id]) => !/^(B\d|L\d)/.test(id)),
            );
        if (had) counts.leader++;
      }
      return [JSON.stringify(r)];
    });
  const ctx = { window: {} };
  runInNewContext(runde1, ctx, {
    timeout: 1000,
    contextCodeGeneration: { strings: false, wasm: false },
  });
  const source = ctx.window.RUNDE1;
  if (!source || !Array.isArray(source.svar)) throw new Error('invalid runde1 archive');
  const remaining = source.svar.filter((r) => {
    if (common.has(runde1Key(r.k, r.init))) {
      counts.runde1++;
      return false;
    }
    return true;
  });
  return {
    counts,
    svar: rows.length ? rows.join('\n') + '\n' : '',
    runde1:
      '/* Runde 1: reinska etter slettingsjournalen. */\nwindow.RUNDE1 = {\n  namn: ' +
      JSON.stringify(source.namn) +
      ',\n  dato: ' +
      JSON.stringify(source.dato) +
      ',\n  svar: [\n' +
      remaining.map((r) => '    ' + JSON.stringify(r)).join(',\n') +
      '\n  ]\n};\n',
  };
}
function main(args) {
  const allowed = ['tombstones', 'svar', 'runde1', 'out'];
  const f = {};
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i]?.replace(/^--/, '');
    if (!allowed.includes(name) || !args[i + 1])
      throw new Error(
        'usage: clean-archive --tombstones <json> --svar <in> --runde1 <in> --out <dir>',
      );
    f[name] = args[i + 1];
  }
  if (allowed.some((k) => !f[k])) throw new Error('missing archive flag');
  if ([f.svar, f.runde1].some((p) => resolve(p).startsWith(resolve(f.out) + '/')))
    throw new Error('output must not overwrite input');
  const result = cleanArchive(
    JSON.parse(readFileSync(f.tombstones, 'utf8')),
    readFileSync(f.svar, 'utf8'),
    readFileSync(f.runde1, 'utf8'),
  );
  mkdirSync(f.out, { recursive: true, mode: 0o700 });
  writeFileSync(resolve(f.out, 'svar.jsonl'), result.svar, { mode: 0o600 });
  writeFileSync(resolve(f.out, 'runde1.js'), result.runde1, { mode: 0o600 });
  process.stdout.write(JSON.stringify(result.counts) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv.slice(2));
