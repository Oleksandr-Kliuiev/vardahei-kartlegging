// ANTHROPIC_API_KEY=… pnpm --filter @varde/tools-eval eval:run [-- --brief <name>] [--force]
//   [--recheck] [--rater <name>]
// Live eval run (task 0.14, ADR-010): every brief × model of models.json × runs_per_brief, one
// Messages API request each through the official SDK — structured output by the draft schema
// (`output_config.format`), adaptive thinking, explicit effort, no forced tool_choice, no
// prefill. The key is read only from ANTHROPIC_API_KEY and never written anywhere. Existing
// records are kept (re-run with --force); --recheck re-applies the automatic checks to the
// recorded answers without calling the API. Afterwards the reading pack (lesepakke.md) is
// regenerated and an empty scoring sheet scores/<rater>.csv is created if there is none.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { surveyDraftJsonSchema } from '@varde/schema/survey-draft';
import { type EvalConfig, loadConfig, type ModelEntry } from './config.js';
import { briefNames, briefsVersion, promptHash, schemaHash, short } from './hash.js';
import { renderLesepakke, renderSheet } from './lesepakke.js';
import {
  BRIEFS_DIR,
  cliArgs,
  MODELS_FILE,
  PROMPT_FILE,
  repoPath,
  RUNS_DIR,
  SCORES_DIR,
} from './paths.js';
import {
  buildRecord,
  evaluate,
  readRecord,
  recordPath,
  type RunRecord,
  serializeRecord,
  tripleDir,
  type Triple,
} from './record.js';

/** The key goes to the Anthropic API only: ANTHROPIC_BASE_URL and other credential sources are ignored. */
const API_BASE_URL = 'https://api.anthropic.com';

interface Job {
  model: ModelEntry;
  brief: string;
  run: number;
  file: string;
}

function jobs(config: EvalConfig, base: Omit<Triple, 'model'>, briefs: string[]): Job[] {
  return config.models.flatMap((model) =>
    briefs.flatMap((brief) =>
      Array.from({ length: config.runs_per_brief }, (_, i) => ({
        model,
        brief,
        run: i + 1,
        file: recordPath(RUNS_DIR, { ...base, model: model.id }, brief, i + 1),
      })),
    ),
  );
}

function write(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function summary(r: RunRecord): string {
  const warnings = [
    ...r.checks.long_questions.map((q) => `>25 words ${q}`),
    ...r.checks.missing_dont_know.map((q) => `no «veit ikkje» ${q}`),
  ];
  return [
    `${r.triple.model} ${r.brief}#${r.run}: ${r.response.stop_reason ?? 'null'}`,
    `${r.response.usage.output_tokens} output tokens`,
    `$${r.cost_usd.toFixed(4)}`,
    `${Math.round(r.duration_ms / 1000)} s`,
    `critical: ${r.auto_critical.join(' ') || '—'}`,
    `warnings: ${warnings.join(', ') || '—'}`,
  ].join(' · ');
}

/** Client for the eval: the key from the caller (ANTHROPIC_API_KEY), the official API host only. */
export function createClient(apiKey: string, fetch?: typeof globalThis.fetch): Anthropic {
  return new Anthropic({
    apiKey,
    authToken: null,
    baseURL: API_BASE_URL,
    ...(fetch ? { fetch } : {}),
  });
}

/** One request: structured output, adaptive thinking, explicit effort; no tool_choice, no prefill. */
export async function callModel(
  client: Anthropic,
  model: ModelEntry,
  system: string,
  brief: string,
): Promise<Anthropic.Message> {
  const stream = client.messages.stream({
    model: model.id,
    max_tokens: model.max_tokens,
    system,
    messages: [{ role: 'user', content: brief }],
    thinking: { type: 'adaptive' },
    output_config: {
      effort: model.effort,
      format: { type: 'json_schema', schema: surveyDraftJsonSchema() },
    },
  });
  return stream.finalMessage();
}

/** Reading pack of the current triple and, when missing, an empty scoring sheet. */
function writeOutputs(
  all: Job[],
  briefs: string[],
  base: Omit<Triple, 'model'>,
  rater: string,
): void {
  const records = all.filter((j) => existsSync(j.file)).map((j) => readRecord(j.file));
  if (records.length === 0) {
    console.log('no recorded runs for the current triple yet');
    return;
  }
  const pack = briefs.map((brief) => ({
    brief,
    text: readFileSync(join(BRIEFS_DIR, `${brief}.md`), 'utf8'),
    records: records.filter((r) => r.brief === brief),
  }));
  const header = [
    `Briefar \`${short(base.briefs_version)}\` · prompt \`${short(base.prompt_hash)}\` · ${records.length} utkast.`,
  ];
  const packFile = join(tripleDir(RUNS_DIR, base), 'lesepakke.md');
  write(packFile, renderLesepakke(pack, header));
  console.log(`wrote ${repoPath(packFile)}`);
  const sheet = join(SCORES_DIR, `${rater}.csv`);
  if (existsSync(sheet)) console.log(`${repoPath(sheet)} exists, left as is`);
  else if (records.length === all.length) {
    write(sheet, renderSheet(records));
    console.log(`wrote ${repoPath(sheet)} (empty scoring sheet)`);
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: cliArgs(),
    options: {
      brief: { type: 'string', multiple: true },
      force: { type: 'boolean', default: false },
      recheck: { type: 'boolean', default: false },
      rater: { type: 'string', default: 'oleksandr' },
    },
  });
  const config = loadConfig(MODELS_FILE);
  const system = readFileSync(PROMPT_FILE, 'utf8');
  const briefs = briefNames(BRIEFS_DIR);
  const unknown = (values.brief ?? []).filter((b) => !briefs.includes(b));
  if (unknown.length > 0) throw new Error(`unknown brief(s): ${unknown.join(', ')}`);
  const base = { prompt_hash: promptHash(PROMPT_FILE), briefs_version: briefsVersion(BRIEFS_DIR) };
  const all = jobs(config, base, briefs);
  const selected = all.filter((j) => values.brief === undefined || values.brief.includes(j.brief));
  console.log(
    `triple: prompt ${short(base.prompt_hash)} · briefs ${short(base.briefs_version)} · ${selected.length} run(s)`,
  );

  if (values.recheck) {
    for (const job of selected.filter((j) => existsSync(j.file))) {
      const record = readRecord(job.file);
      const { checks, auto_critical } = evaluate(record.response.text, record.response.stop_reason);
      write(job.file, serializeRecord({ ...record, checks, auto_critical }));
    }
    writeOutputs(all, briefs, base, values.rater);
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey.trim() === '') {
    console.error(
      'ANTHROPIC_API_KEY is not set. Export it in this shell only; it is never written to the repository.',
    );
    process.exit(2);
  }
  const client = createClient(apiKey);
  let spent = 0;
  for (const job of selected) {
    if (existsSync(job.file) && !values.force) {
      console.log(`${job.model.id} ${job.brief}#${job.run}: recorded, skipped (--force re-runs)`);
      continue;
    }
    const text = readFileSync(join(BRIEFS_DIR, `${job.brief}.md`), 'utf8');
    const startedAt = new Date();
    const t0 = performance.now();
    const message = await callModel(client, job.model, system, text);
    const record = buildRecord(message, {
      triple: { ...base, model: job.model.id },
      schemaHash: schemaHash(),
      brief: job.brief,
      run: job.run,
      model: job.model,
      startedAt,
      durationMs: performance.now() - t0,
    });
    write(job.file, serializeRecord(record));
    spent += record.cost_usd;
    console.log(summary(record));
  }
  console.log(`estimated cost of this run: $${spent.toFixed(4)}`);
  writeOutputs(all, briefs, base, values.rater);
}

function explain(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError)
    return 'API key rejected (401): check ANTHROPIC_API_KEY and its workspace.';
  if (e instanceof Anthropic.PermissionDeniedError) return `no access (403): ${e.message}`;
  if (e instanceof Anthropic.NotFoundError)
    return `model not available to the organization (404): ${e.message}`;
  if (e instanceof Anthropic.RateLimitError)
    return 'rate or spend limit reached (429): recorded runs are kept; run again later.';
  if (e instanceof Anthropic.BadRequestError) return `request rejected (400): ${e.message}`;
  if (e instanceof Anthropic.APIConnectionError) return `no connection to the API: ${e.message}`;
  if (e instanceof Anthropic.APIError) return `API error ${String(e.status)}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (e) {
    console.error(`eval:run stopped: ${explain(e)}`);
    process.exit(1);
  }
}
