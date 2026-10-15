// Task 0.14: recorded runs (committed eval fixtures) — reproducible automatic checks, no live
// calls, and no x-api-key, Authorization or sk-ant- anywhere under runs/. Skipped until
// Oleksandr's live run has recorded something.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { briefNames, briefsVersion, promptHash, schemaHash } from '../src/hash.js';
import { BRIEFS_DIR, PROMPT_FILE, RUNS_DIR } from '../src/paths.js';
import {
  buildRecord,
  filesUnder,
  recordPath,
  type RunRecord,
  serializeRecord,
} from '../src/record.js';
import { type Current, verifyRuns } from '../src/recorded.js';
import { context, draft, HASH_A, HASH_B, message } from './support.js';

const recorded = filesUnder(RUNS_DIR).filter((f) => f.endsWith('.json'));

if (recorded.length === 0) {
  it.skip('skipped: no recorded runs', () => {});
} else {
  it(`recorded runs (${recorded.length}): clean, at their triple path, checks reproduce`, () => {
    const current: Current = {
      prompt_hash: promptHash(PROMPT_FILE),
      briefs_version: briefsVersion(BRIEFS_DIR),
      schema_hash: schemaHash(),
      briefs: briefNames(BRIEFS_DIR),
    };
    expect(verifyRuns(RUNS_DIR, current)).toEqual([]);
  });
}

describe('verifyRuns (synthetic runs/ in a temp dir)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'varde-eval-runs-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const current: Current = {
    prompt_hash: HASH_A,
    briefs_version: HASH_B,
    schema_hash: 'c'.repeat(64),
    briefs: ['backup-hotell'],
  };
  const put = (file: string, text: string): void => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  const record = buildRecord(message(JSON.stringify(draft())), context());
  const file = recordPath(dir, record.triple, record.brief, record.run);

  it('accepts a record written by run.ts', () => {
    put(file, serializeRecord(record));
    expect(verifyRuns(dir, current)).toEqual([]);
  });

  it('flags keys and headers in any file, extra keys, wrong paths, stale checks and schema', () => {
    const planted = ['sk', 'ant', 'admin01', 'y'.repeat(20)].join('-');
    put(join(dir, 'notes.md'), `Authorization: Bearer ${planted}`);
    put(file.replace('-1.json', '-2.json'), serializeRecord(record));
    const tampered: RunRecord = { ...record, brief: 'ki-kvardag', auto_critical: ['refusal'] };
    put(recordPath(dir, tampered.triple, tampered.brief, 1), serializeRecord(tampered));
    put(
      file.replace('-1.json', '-3.json'),
      JSON.stringify({ ...record, headers: { 'x-request-id': 1 } }),
    );
    // Files in path order: backup-hotell-1 (valid), -2 (run 1 under the name of run 2),
    // -3 (extra key), ki-kvardag-1 (unknown brief, edited checks), notes.md (planted key).
    expect(
      verifyRuns(dir, { ...current, schema_hash: 'd'.repeat(64) }).map((p) => p.split(': ')[1]),
    ).toEqual([
      'recorded with another output schema (eval:run -- --force)',
      'path does not match its triple, brief and run',
      'recorded with another output schema (eval:run -- --force)',
      'not a run record (strict schema)',
      'brief ki-kvardag is not in briefs/v1',
      'recorded with another output schema (eval:run -- --force)',
      'automatic checks do not reproduce (eval:run -- --recheck)',
      'key or header pattern',
    ]);
  });
});
