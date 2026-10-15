// Checks of the committed runs/ (task 0.14, run.test.ts): no keys or headers anywhere; every
// record loads with the strict schema, sits at its triple path and matches its output id; for the
// current triple the automatic checks reproduce from the recorded answer (no live calls).
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { sha256, short } from './hash.js';
import {
  evaluate,
  filesUnder,
  readRecord,
  recordPath,
  type RunRecord,
  SECRET_PATTERN,
} from './record.js';

export interface Current {
  prompt_hash: string;
  briefs_version: string;
  schema_hash: string;
  briefs: string[];
}

/** Problems found under `runsDir`; empty when the recorded runs are clean. */
export function verifyRuns(runsDir: string, current: Current): string[] {
  const problems: string[] = [];
  for (const file of filesUnder(runsDir)) {
    const rel = relative(runsDir, file);
    if (SECRET_PATTERN.test(readFileSync(file, 'utf8')))
      problems.push(`${rel}: key or header pattern`);
    if (!file.endsWith('.json')) continue;
    let record: RunRecord;
    try {
      record = readRecord(file);
    } catch {
      problems.push(`${rel}: not a run record (strict schema)`);
      continue;
    }
    if (recordPath(runsDir, record.triple, record.brief, record.run) !== file)
      problems.push(`${rel}: path does not match its triple, brief and run`);
    if (record.output_sha !== short(sha256(record.response.text)))
      problems.push(`${rel}: output_sha does not match the recorded answer`);
    const isCurrent =
      record.triple.prompt_hash === current.prompt_hash &&
      record.triple.briefs_version === current.briefs_version;
    if (!isCurrent) continue; // runs of earlier triples are history: only the scan above applies
    if (!current.briefs.includes(record.brief))
      problems.push(`${rel}: brief ${record.brief} is not in briefs/v1`);
    if (record.schema_hash !== current.schema_hash)
      problems.push(`${rel}: recorded with another output schema (eval:run -- --force)`);
    const again = evaluate(record.response.text, record.response.stop_reason);
    const same =
      JSON.stringify(again.checks) === JSON.stringify(record.checks) &&
      JSON.stringify(again.auto_critical) === JSON.stringify(record.auto_critical);
    if (!same) problems.push(`${rel}: automatic checks do not reproduce (eval:run -- --recheck)`);
  }
  return problems;
}
