// Samtalar (decision 07.11; acceptance and re-review of 2.22c): which files of the API may take the
// employees' view (one client's employee numbers) and the dashboard's view classes. The privacy
// selfcheck lints a file that tries them; this test pins the configuration of the files it cannot
// stand in for: the three that may take the employees' view still take no dashboard view class.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const VARDE = fileURLToPath(new URL('../../..', import.meta.url));
const DASHBOARD = '(^|/)dashboard/(aggregate|comparison|rows|leader|before-after)-view(\\.js)?$';
const EMPLOYEES = '(^|/)employee-view(\\.js)?$';

/** The `regex` patterns of no-restricted-imports that the real config gives a file. */
async function bans(path: string) {
  const config = (await new ESLint({ cwd: VARDE }).calculateConfigForFile(join(VARDE, path))) as {
    rules?: Record<string, unknown>;
  };
  const rule = config.rules?.['no-restricted-imports'] as
    [unknown, { patterns?: { regex?: string; importNames?: string[] }[] }?] | undefined;
  return rule?.[1]?.patterns ?? [];
}
const regexes = async (path: string) => (await bans(path)).map((p) => p.regex);

describe('the employees view and the dashboard views in the API', () => {
  it.each([
    'apps/api/src/modules/interviews/employee-view.ts',
    'apps/api/src/modules/interviews/employees.controller.ts',
    'apps/api/src/modules/interviews/interviews.module.ts',
  ])('%s may take the employees view, never a dashboard view class', async (path) => {
    const patterns = await bans(path);
    expect(patterns.map((p) => p.regex)).toContain(DASHBOARD);
    expect(patterns.map((p) => p.regex)).not.toContain(EMPLOYEES);
    expect(patterns.find((p) => p.regex === DASHBOARD)?.importNames).toEqual([
      'AggregateView',
      'ComparisonView',
      'RowsView',
      'LeaderView',
      'BeforeAfterView',
    ]);
  });

  it('any other file of the interviews module takes neither', async () => {
    for (const path of [
      'apps/api/src/modules/interviews/interview-overview.ts',
      'apps/api/src/modules/interviews/interviews.service.ts',
    ])
      expect(await regexes(path)).toEqual(expect.arrayContaining([DASHBOARD, EMPLOYEES]));
  });

  it('the rest of the API takes no employees view; privacy keeps its own rules', async () => {
    expect(await regexes('apps/api/src/modules/exports/csv.service.ts')).toContain(EMPLOYEES);
    expect(await regexes('apps/api/src/modules/dashboard/aggregate-view.ts')).toContain(EMPLOYEES);
    expect(await regexes('apps/api/src/modules/privacy/privacy.service.ts')).not.toContain(
      EMPLOYEES,
    );
  });
});
