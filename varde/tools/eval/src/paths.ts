// Locations of the eval inputs and outputs (task 0.14). Directory names of runs/ use the first
// 12 hex digits of the hashes; records, the report and config/model.json carry the full hashes.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EVAL_DIR = fileURLToPath(new URL('../', import.meta.url));
export const VARDE_DIR = fileURLToPath(new URL('../../../', import.meta.url));
export const REPO_DIR = fileURLToPath(new URL('../../../../', import.meta.url));

export const BRIEFS_DIR = join(EVAL_DIR, 'briefs', 'v1');
export const PROMPT_FILE = join(EVAL_DIR, 'prompt', 'v1.md');
export const MODELS_FILE = join(EVAL_DIR, 'models.json');
export const RUNS_DIR = join(EVAL_DIR, 'runs');
export const SCORES_DIR = join(EVAL_DIR, 'scores');
/** Written by blind.ts of the full version (not in the simplified 0.14); optional for score.ts. */
export const BLIND_KEY_FILE = join(EVAL_DIR, 'blind-key.json');
export const REPORT_FILE = join(REPO_DIR, 'docs', 'varde', 'evidence', 'stage-0', '0.14-report.md');
export const MODEL_CONFIG_FILE = join(VARDE_DIR, 'config', 'model.json');

/** Repository-relative path with forward slashes (for reports and messages). */
export function repoPath(abs: string): string {
  return abs.startsWith(REPO_DIR) ? abs.slice(REPO_DIR.length).split('\\').join('/') : abs;
}

/** Arguments after the script name; pnpm passes a literal `--` through, which is dropped. */
export function cliArgs(): string[] {
  const args = process.argv.slice(2);
  return args[0] === '--' ? args.slice(1) : args;
}
