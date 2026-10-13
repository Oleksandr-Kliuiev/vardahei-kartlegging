#!/usr/bin/env node
// `pnpm lint:privacy:selfcheck`: copies the bypass fixture into apps/api/src/modules/dashboard,
// lints it with the real config and requires `varde/privacy-only-release` errors for both
// bypasses (tx.response.findMany and include: { responses: true }, 0.19b); anything else fails.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RULE = 'varde/privacy-only-release';
const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, '..', '..');
const parent = join(root, 'apps/api/src/modules/dashboard');
const parentExisted = existsSync(parent);
const dir = join(parent, '__selfcheck__');
const target = join(dir, 'bypass.ts');

mkdirSync(dir, { recursive: true });
copyFileSync(join(here, 'fixtures/bypass.ts'), target);
let ok = false;
try {
  const eslint = join(root, 'node_modules/eslint/bin/eslint.js');
  const run = spawnSync(process.execPath, [eslint, '--format', 'json', target], {
    cwd: root,
    encoding: 'utf8',
  });
  /** @type {{ messages: { ruleId: string | null, message: string }[] }[]} */
  let results = [];
  try {
    results = JSON.parse(run.stdout);
  } catch {
    console.error(`selfcheck: FAILED (eslint exit ${run.status}, no JSON)\n${run.stderr}`);
  }
  const messages = results.flatMap((r) => r.messages);
  const hits = messages.filter((m) => m.ruleId === RULE);
  const others = messages.filter((m) => m.ruleId !== RULE);
  const kinds = new Set(
    hits.map((m) => (m.message.includes('include/select') ? 'relation' : 'model')),
  );
  if (kinds.has('model') && kinds.has('relation') && others.length === 0) ok = true;
  else if (results.length > 0) {
    console.error(`selfcheck: FAILED (exit ${run.status}): ${JSON.stringify(messages, null, 2)}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
  if (!parentExisted && existsSync(parent) && readdirSync(parent).length === 0) {
    rmSync(parent, { recursive: true });
  }
}
if (ok) console.log('selfcheck: bypass rejected (tx.response, include responses)');
process.exit(ok ? 0 : 1);
