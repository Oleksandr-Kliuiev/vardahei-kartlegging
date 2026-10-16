// Task 0.14 (preparation of 2.13): varde/config/model.json exists only after a pass, and then
// a report with the same triple (prompt_hash, model, briefs_version) must exist and be current.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { parseRatings } from '../src/csv.js';
import { briefsVersion, promptHash } from '../src/hash.js';
import { ModelConfig, reportSummary, verifyModelConfig } from '../src/model-config.js';
import { BRIEFS_DIR, MODEL_CONFIG_FILE, MODELS_FILE, PROMPT_FILE, REPO_DIR } from '../src/paths.js';
import { renderReport } from '../src/report.js';
import { aggregate, THRESHOLDS } from '../src/score.js';
import { HASH_A, HASH_B, OPUS, runs5 } from './support.js';

if (!existsSync(MODEL_CONFIG_FILE)) {
  it.skip('skipped: no model.json (eval:score -- --select <model> writes it after pass)', () => {});
} else {
  it('varde/config/model.json matches a current pass report', () => {
    const config = ModelConfig.parse(JSON.parse(readFileSync(MODEL_CONFIG_FILE, 'utf8')));
    const report = readFileSync(join(REPO_DIR, config.report), 'utf8');
    const current = {
      prompt_hash: promptHash(PROMPT_FILE),
      briefs_version: briefsVersion(BRIEFS_DIR),
    };
    expect(verifyModelConfig(config, report, current)).toEqual([]);
  });
}

describe('verifyModelConfig (on a rendered report)', () => {
  const sheet = (rows: string): string =>
    `brief,variant,meaning_1_5,naturalness_1_5,edit_minutes,critical_errors\n${rows}`;
  const rows = (n: number, natural: number): string =>
    ['brief-a', 'brief-b', 'brief-c', 'brief-d', 'brief-e']
      .map((b) => `${b},claude-opus-5-5#1,${n},${natural},2,`)
      .join('\n');
  const base = { prompt_hash: HASH_A, briefs_version: HASH_B };
  const config = { ...loadConfig(MODELS_FILE), models: [OPUS] };
  const report = (natural: number, selected: boolean): string => {
    const results = aggregate(
      runs5(),
      parseRatings(sheet(rows(4, natural)), 'o.csv'),
      THRESHOLDS.simplified,
    );
    return renderReport({
      config,
      thresholds: THRESHOLDS.simplified,
      base,
      results,
      inputs: [],
      selected: selected ? OPUS : null,
    });
  };
  const chosen = {
    model: OPUS.id,
    effort: OPUS.effort,
    ...base,
    report: 'docs/varde/evidence/stage-0/0.14-report.md',
  };

  it('accepts the chosen model of a pass report with the current triple', () => {
    expect(reportSummary(report(5, true)).selected).toBe(OPUS.id);
    expect(verifyModelConfig(chosen, report(5, true), base)).toEqual([]);
  });

  it('rejects a fail report, a report without the choice and a changed prompt', () => {
    expect(verifyModelConfig(chosen, report(3, true), base)).toContain(
      'report has no pass for claude-opus-5-5',
    );
    expect(verifyModelConfig(chosen, report(5, false), base)).toEqual([
      'report does not record the choice of claude-opus-5-5',
    ]);
    expect(
      verifyModelConfig(chosen, report(5, true), { ...base, prompt_hash: 'f'.repeat(64) }),
    ).toEqual(['prompt changed since the eval: run the live eval again (ADR-018)']);
  });
});
