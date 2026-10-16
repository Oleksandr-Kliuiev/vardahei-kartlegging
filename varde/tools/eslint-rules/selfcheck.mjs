#!/usr/bin/env node
// `pnpm lint:privacy:selfcheck`: copies the bypass fixture into apps/api/src/modules/dashboard,
// lints it with the real config and requires `varde/privacy-only-release` errors for both
// bypasses (tx.response.findMany and include: { responses: true }, 0.19b) and the participant one
// (prisma.registration.findMany, 3.1); anything else fails.
// Since 1.10b also fixtures/cast.ts: `as ReleasedSnapshot` outside privacy → no-restricted-syntax.
// Since 16.10 also fixtures/round-client.ts, copied into apps/api/src/modules/seminars: a client's
// own round_client cells (ownCells, adminClientCells) and saved findings → varde/round-client-exits.
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
const cast = join(dir, 'cast.ts');
const seminars = join(root, 'apps/api/src/modules/seminars');
const seminarsExisted = existsSync(seminars);
const roundClientDir = join(seminars, '__selfcheck__');
const roundClient = join(roundClientDir, 'round-client.ts');

mkdirSync(dir, { recursive: true });
copyFileSync(join(here, 'fixtures/bypass.ts'), target);
copyFileSync(join(here, 'fixtures/cast.ts'), cast);
mkdirSync(roundClientDir, { recursive: true });
copyFileSync(join(here, 'fixtures/round-client.ts'), roundClient);
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
  const castRun = spawnSync(process.execPath, [eslint, '--format', 'json', cast], { cwd: root, encoding: 'utf8' });
  let castMessages = [];
  try {
    castMessages = JSON.parse(castRun.stdout).flatMap((r) => r.messages);
  } catch {
    console.error(`selfcheck: FAILED (cast: eslint exit ${castRun.status}, no JSON)\n${castRun.stderr}`);
  }
  const castOk =
    castMessages.length > 0 &&
    castMessages.every((m) => m.ruleId === 'no-restricted-syntax' && m.message.includes('ReleasedSnapshot'));
  if (!castOk) console.error(`selfcheck: FAILED (cast): ${JSON.stringify(castMessages, null, 2)}`);
  // 3.1: the participant bypass (registration) is reported as well.
  const participants = hits.some((m) => m.message.includes('`registration`'));
  // 16.10: both round_client exits and the saved findings, nothing else.
  const rcRun = spawnSync(process.execPath, [eslint, '--format', 'json', roundClient], {
    cwd: root,
    encoding: 'utf8',
  });
  let rcMessages = [];
  try {
    rcMessages = JSON.parse(rcRun.stdout).flatMap((r) => r.messages);
  } catch {
    console.error(`selfcheck: FAILED (round-client: eslint exit ${rcRun.status}, no JSON)\n${rcRun.stderr}`);
  }
  const rcOk =
    rcMessages.length === 3 &&
    rcMessages.every((m) => m.ruleId === 'varde/round-client-exits') &&
    ['`ownCells`', '`adminClientCells`', 'Saved findings'].every((s) =>
      rcMessages.some((m) => m.message.includes(s)),
    );
  if (!rcOk) console.error(`selfcheck: FAILED (round-client): ${JSON.stringify(rcMessages, null, 2)}`);
  if (
    kinds.has('model') &&
    kinds.has('relation') &&
    participants &&
    others.length === 0 &&
    castOk &&
    rcOk
  )
    ok = true;
  else if (results.length > 0) {
    console.error(`selfcheck: FAILED (exit ${run.status}): ${JSON.stringify(messages, null, 2)}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(roundClientDir, { recursive: true, force: true });
  if (!seminarsExisted && existsSync(seminars) && readdirSync(seminars).length === 0) {
    rmSync(seminars, { recursive: true });
  }
  if (!parentExisted && existsSync(parent) && readdirSync(parent).length === 0) {
    rmSync(parent, { recursive: true });
  }
}
if (ok)
  console.log(
    'selfcheck: bypass rejected (tx.response, include responses, registration, as ReleasedSnapshot, round_client exits, saved findings)',
  );
process.exit(ok ? 0 : 1);
