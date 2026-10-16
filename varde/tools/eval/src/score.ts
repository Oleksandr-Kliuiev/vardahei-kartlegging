// pnpm --filter @varde/tools-eval eval:score [-- --select <model>]
// Aggregates scores/*.csv against the recorded runs of the current triple, applies the
// thresholds (ADR-010; simplified 0.14 by decision of Oleksandr 13.10), writes
// docs/varde/evidence/stage-0/0.14-report.md and, with --select after pass, varde/config/model.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { type Rating, readRatings } from './csv.js';
import { briefNames, briefsVersion, promptHash, schemaHash, sha256 } from './hash.js';
import { ModelConfig } from './model-config.js';
import {
  BLIND_KEY_FILE,
  BRIEFS_DIR,
  cliArgs,
  MODEL_CONFIG_FILE,
  MODELS_FILE,
  PROMPT_FILE,
  REPORT_FILE,
  repoPath,
  RUNS_DIR,
  SCORES_DIR,
} from './paths.js';
import {
  type CriticalCode,
  filesUnder,
  parseVariant,
  readRecord,
  recordPath,
  type RunRecord,
  variantLabel,
} from './record.js';
import { renderReport } from './report.js';

export interface Thresholds {
  /** Number of briefs the profile is defined for. */
  briefs: number;
  /** Minimum number of raters (score sheets). */
  raters: number;
  median_meaning: number;
  median_naturalness: number;
  /** Briefs without any critical error, at least. */
  critical_free_briefs: number;
  /** Briefs whose median edit time exceeds slow_minutes, at most; null = reported, not gated. */
  slow_briefs_max: number | null;
  slow_minutes: number;
}

export const THRESHOLDS = {
  /** Decision of Oleksandr 13.10: 5 briefs × 1 model × 1 run, Oleksandr rates alone. */
  simplified: {
    briefs: 5,
    raters: 1,
    median_meaning: 4,
    median_naturalness: 4,
    critical_free_briefs: 4,
    slow_briefs_max: null,
    slow_minutes: 5,
  },
  /** ADR-010: 10 briefs × 2 models × 2 runs, two blind raters. */
  full: {
    briefs: 10,
    raters: 2,
    median_meaning: 4,
    median_naturalness: 4,
    critical_free_briefs: 8,
    slow_briefs_max: 2,
    slow_minutes: 5,
  },
} as const satisfies Record<string, Thresholds>;

/** What score needs of a recorded run. */
export interface RunRef {
  model: string;
  brief: string;
  run: number;
  output_sha: string;
  auto_critical: CriticalCode[];
  cost_usd: number;
}

export const runRef = (r: RunRecord): RunRef => ({
  model: r.triple.model,
  brief: r.brief,
  run: r.run,
  output_sha: r.output_sha,
  auto_critical: r.auto_critical,
  cost_usd: r.cost_usd,
});

/** Blind key of the full version: brief → letter → `<model>#<run>`. */
export const BlindKey = z.record(z.string(), z.record(z.string(), z.string()));
export type BlindKey = z.infer<typeof BlindKey>;

export interface BriefResult {
  brief: string;
  median_meaning: number;
  median_naturalness: number;
  median_edit_minutes: number;
  slow: boolean;
  /** Union of the codes of every rater in every run and of the automatic checks. */
  critical: CriticalCode[];
  cost_usd: number;
}

export interface ModelResult {
  model: string;
  ratings: number;
  median_meaning: number;
  median_naturalness: number;
  sum_of_medians: number;
  critical_free_briefs: number;
  slow_briefs: string[];
  briefs: BriefResult[];
  cost_usd: number;
  cost_per_brief_usd: number;
  pass: boolean;
  /** Why the model failed (empty on pass), in Russian for the report. */
  reasons: string[];
}

export class ScoreInputError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'));
  }
}

export function median(values: number[]): number {
  if (values.length === 0) throw new Error('median of no values');
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const sum = (ns: number[]): number => ns.reduce((a, b) => a + b, 0);

/**
 * Aggregation rules (0d.md, task 0.14; fixed in test/score.test.ts):
 * - medians of meaning and naturalness over all ratings of the model (briefs × runs × raters);
 * - a brief is slow when the median of its edit_minutes (runs × raters) exceeds slow_minutes;
 * - a brief is critical-free when no rater in no run marked a critical error and the automatic
 *   checks of its runs found none;
 * - pass: both medians ≥ thresholds, slow briefs ≤ max (when gated), critical-free briefs ≥ min.
 */
export function aggregate(
  runs: RunRef[],
  ratings: Rating[],
  t: Thresholds,
  key: BlindKey = {},
): ModelResult[] {
  const problems: string[] = [];
  const id = (model: string, brief: string, run: number): string => `${model}|${brief}|${run}`;
  const byId = new Map(runs.map((r) => [id(r.model, r.brief, r.run), r]));
  const briefs = [...new Set(runs.map((r) => r.brief))].sort();
  if (briefs.length !== t.briefs)
    problems.push(`profile expects ${t.briefs} briefs, the recorded runs cover ${briefs.length}`);
  const raters = [...new Set(ratings.map((r) => r.rater))].sort();
  if (raters.length < t.raters)
    problems.push(`profile expects ${t.raters} rater(s), found ${raters.length}`);

  const resolved: { rating: Rating; run: RunRef }[] = [];
  const seen = new Set<string>();
  for (const rating of ratings) {
    const variant = parseVariant(key[rating.brief]?.[rating.variant] ?? rating.variant);
    const run = variant ? byId.get(id(variant.model, rating.brief, variant.run)) : undefined;
    if (!run) {
      problems.push(`${rating.at}: no recorded run for ${rating.brief} / ${rating.variant}`);
      continue;
    }
    if (rating.output_sha !== null && rating.output_sha !== run.output_sha)
      problems.push(
        `${rating.at}: output_sha ${rating.output_sha} is not the recorded answer ${run.output_sha}`,
      );
    const k = `${rating.rater}|${id(run.model, run.brief, run.run)}`;
    if (seen.has(k))
      problems.push(
        `${rating.at}: ${rating.rater} rated ${rating.brief} / ${rating.variant} twice`,
      );
    seen.add(k);
    resolved.push({ rating, run });
  }
  for (const rater of raters)
    for (const run of runs)
      if (!seen.has(`${rater}|${id(run.model, run.brief, run.run)}`))
        problems.push(`${rater}: no rating for ${run.brief} / ${variantLabel(run.model, run.run)}`);
  if (problems.length > 0) throw new ScoreInputError(problems);

  return [...new Set(runs.map((r) => r.model))].map((model) => {
    const mine = resolved.filter((x) => x.run.model === model);
    const perBrief: BriefResult[] = briefs.map((brief) => {
      const rated = mine.filter((x) => x.run.brief === brief).map((x) => x.rating);
      const own = runs.filter((r) => r.model === model && r.brief === brief);
      const edit = median(rated.map((r) => r.edit_minutes));
      const codes = [...own.flatMap((r) => r.auto_critical), ...rated.flatMap((r) => r.critical)];
      return {
        brief,
        median_meaning: median(rated.map((r) => r.meaning)),
        median_naturalness: median(rated.map((r) => r.naturalness)),
        median_edit_minutes: edit,
        slow: edit > t.slow_minutes,
        critical: [...new Set(codes)].sort(),
        cost_usd: round6(sum(own.map((r) => r.cost_usd))),
      };
    });
    const mm = median(mine.map((x) => x.rating.meaning));
    const mn = median(mine.map((x) => x.rating.naturalness));
    const slow = perBrief.filter((b) => b.slow).map((b) => b.brief);
    const clean = perBrief.filter((b) => b.critical.length === 0).length;
    const reasons: string[] = [];
    if (mm < t.median_meaning) reasons.push(`медиана смысла ${mm} < ${t.median_meaning}`);
    if (mn < t.median_naturalness)
      reasons.push(`медиана естественности ${mn} < ${t.median_naturalness}`);
    if (t.slow_briefs_max !== null && slow.length > t.slow_briefs_max)
      reasons.push(
        `брифов с правкой > ${t.slow_minutes} мин: ${slow.length} > ${t.slow_briefs_max}`,
      );
    if (clean < t.critical_free_briefs)
      reasons.push(
        `брифов без критических ошибок ${clean} из ${briefs.length} < ${t.critical_free_briefs}`,
      );
    const cost = sum(perBrief.map((b) => b.cost_usd));
    return {
      model,
      ratings: mine.length,
      median_meaning: mm,
      median_naturalness: mn,
      sum_of_medians: mm + mn,
      critical_free_briefs: clean,
      slow_briefs: slow,
      briefs: perBrief,
      cost_usd: round6(cost),
      cost_per_brief_usd: round6(cost / briefs.length),
      pass: reasons.length === 0,
      reasons,
    };
  });
}

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function main(): void {
  const { values } = parseArgs({ args: cliArgs(), options: { select: { type: 'string' } } });
  const config = loadConfig(MODELS_FILE);
  const t = THRESHOLDS[config.thresholds];
  const base = { prompt_hash: promptHash(PROMPT_FILE), briefs_version: briefsVersion(BRIEFS_DIR) };
  const records: RunRecord[] = [];
  const recordFiles: string[] = [];
  const missing: string[] = [];
  for (const m of config.models)
    for (const brief of briefNames(BRIEFS_DIR))
      for (let run = 1; run <= config.runs_per_brief; run += 1) {
        const file = recordPath(RUNS_DIR, { ...base, model: m.id }, brief, run);
        if (!existsSync(file)) missing.push(repoPath(file));
        else {
          records.push(readRecord(file));
          recordFiles.push(file);
        }
      }
  if (missing.length > 0)
    fail(
      `No recorded runs for the current triple (run eval:run first):\n  ${missing.join('\n  ')}`,
    );
  const effort = (model: string): string | undefined =>
    config.models.find((m) => m.id === model)?.effort;
  const stale = records.filter(
    (r) => r.schema_hash !== schemaHash() || r.request.effort !== effort(r.triple.model),
  );
  if (stale.length > 0)
    fail(
      `${stale.length} run(s) were recorded with another output schema or effort: run eval:run -- --force`,
    );
  const sheets = filesUnder(SCORES_DIR).filter((f) => f.endsWith('.csv'));
  if (sheets.length === 0) fail(`No scoring sheets in ${repoPath(SCORES_DIR)}/*.csv`);
  const key = existsSync(BLIND_KEY_FILE)
    ? BlindKey.parse(JSON.parse(readFileSync(BLIND_KEY_FILE, 'utf8')))
    : {};
  let results: ModelResult[];
  try {
    results = aggregate(records.map(runRef), sheets.flatMap(readRatings), t, key);
  } catch (e) {
    if (e instanceof ScoreInputError)
      fail(`Scoring sheets do not match the recorded runs:\n  ${e.problems.join('\n  ')}`);
    throw e;
  }
  // A choice already in config/model.json for this triple is kept when the report is rebuilt.
  let choice = values.select;
  if (choice === undefined && existsSync(MODEL_CONFIG_FILE)) {
    const kept = ModelConfig.safeParse(JSON.parse(readFileSync(MODEL_CONFIG_FILE, 'utf8')));
    if (
      kept.success &&
      kept.data.prompt_hash === base.prompt_hash &&
      kept.data.briefs_version === base.briefs_version
    ) {
      choice = kept.data.model;
      console.log(`keeping the choice of ${choice} from ${repoPath(MODEL_CONFIG_FILE)}`);
    }
  }
  const selected = choice === undefined ? null : results.find((r) => r.model === choice);
  if (selected === undefined) fail(`--select ${choice}: not a model of models.json`);
  if (selected && !selected.pass)
    fail(
      `${selected.model} did not pass; G0 stays closed (ADR-010 contingency). If config/model.json names it, remove that file.`,
    );
  const model = selected ? config.models.find((m) => m.id === selected.model) : undefined;
  const inputs = [...sheets, ...recordFiles].map((f) => ({
    file: repoPath(f),
    sha256: sha256(readFileSync(f)),
  }));
  writeFileSync(
    REPORT_FILE,
    renderReport({ config, thresholds: t, base, results, inputs, selected: model ?? null }),
  );
  console.log(`wrote ${repoPath(REPORT_FILE)}`);
  for (const r of results)
    console.log(
      `${r.model}: ${r.pass ? 'PASS' : 'FAIL'} (meaning ${r.median_meaning}, naturalness ${r.median_naturalness}, critical-free ${r.critical_free_briefs}/${r.briefs.length})${r.reasons.length > 0 ? ` — ${r.reasons.join('; ')}` : ''}`,
    );
  if (model) {
    const chosen = {
      model: model.id,
      effort: model.effort,
      ...base,
      report: repoPath(REPORT_FILE),
    };
    writeFileSync(MODEL_CONFIG_FILE, `${JSON.stringify(chosen, null, 2)}\n`);
    console.log(`wrote ${repoPath(MODEL_CONFIG_FILE)} (${model.id}, effort ${model.effort})`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
