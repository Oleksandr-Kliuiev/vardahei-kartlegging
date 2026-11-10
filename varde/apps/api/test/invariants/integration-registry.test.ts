// `pnpm test` runs without Postgres (the CI job «check»); the tests that need it are listed in
// test/support/integration-files.mjs and run by `pnpm test:integration`. A test that boots the app
// but is not on that list passes on a machine where DATABASE_URL happens to be exported, and fails
// in CI with «Environment variable not found: DATABASE_URL» — which is how it went on 10.11.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';
import { INTEGRATION_FILES } from '../support/integration-files.mjs';

const TEST = join(__dirname, '..');
/** The two helpers that start the real app on Postgres. */
const BOOTS = /support\/(?:seminars|app)\.js/;

function tests(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? tests(join(dir, e.name))
      : e.name.endsWith('.test.ts')
        ? [join(dir, e.name)]
        : [],
  );
}

it('every test that boots the app on Postgres is registered as an integration test', () => {
  const listed = new Set(INTEGRATION_FILES);
  const unregistered = tests(TEST)
    .filter((f) => BOOTS.test(readFileSync(f, 'utf8')))
    .map((f) => join('test', relative(TEST, f)))
    .filter((f) => !listed.has(f))
    .sort();
  expect(unregistered).toEqual([]);
});
