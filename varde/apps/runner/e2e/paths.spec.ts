import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Answers } from '@varde/rules/runner';
import type { TemplateContent } from '@varde/schema/template/template';
import type { RunnerRound } from '../src/round.js';
import { state } from './support.js';

const workspace = resolve(import.meta.dirname, '../../..');
const scenarios = (JSON.parse(readFileSync(resolve(workspace, 'tools/parity/golden/paths.json'), 'utf8')) as {
  scenarios: { id: string; survey: string; answers: Answers; path: string[] }[];
}).scenarios;
for (const scenario of scenarios) test(`old runner path: ${scenario.id}`, async ({ page }) => {
  // A leader path answers about 40 questions, each followed by the walk to the next step:
  // about 16 s on a laptop and twice that on a CI runner, so the default 30 s is too tight.
  test.setTimeout(90_000);
  const content = (JSON.parse(readFileSync(resolve(workspace, `config/seed/templates/${scenario.survey}.2026-10-13.json`), 'utf8')) as { content: TemplateContent }).content;
  await page.route('**/api/runner/round', async (route) => {
    const response = await route.fetch();
    const round = await response.json() as RunnerRound;
    round.version.content = content;
    await route.fulfill({ response, json: round });
  });
  await page.goto(`/r?c=${state().nn.code}`);
  await page.locator('#start').click();
  const seen: string[] = [];
  for (const id of scenario.path) {
    if (id === 'B-intro') {
      await expect(page.locator('[data-step="B-intro"]')).toBeVisible();
      seen.push(id);
      await page.locator('#vidare').click();
      continue;
    }
    await expect(page.locator(`[data-question-id="${id}"]`)).toBeVisible();
    seen.push(id);
    const q = content.questions.find((q) => q.id === id)!;
    const value = scenario.answers[id];
    if (id === 'K16') {
      expect(await page.locator('.opt').evaluateAll((els) => els.map((el) => el.getAttribute('data-id')).sort())).toEqual([...(scenario.answers.K3 as string[])].sort());
    }
    if ((q.type === 'single' || q.type === 'multi') && q.options.some((o) => o.visible_if)) {
      const practical = scenario.answers.K1 === 'prod' || (Array.isArray(scenario.answers.K2) && scenario.answers.K2.includes('praktisk'));
      for (const option of q.options.filter((o) => o.visible_if))
        await expect(page.locator(`.opt[data-id="${option.id}"]`)).toHaveCount(practical && (q.choices_from === undefined || (scenario.answers.K3 as string[]).includes(option.id)) ? 1 : 0);
    }
    // The old UI cannot send a scale with a missing row, so that synthetic row is skipped; the
    // path does not depend on partial scale answers (same rule as tools/parity/runner-paths.mjs).
    const partialScale =
      q.type === 'scale' && q.rows.some((r) => typeof value !== 'object' || value === null || Array.isArray(value) || typeof value[r.id] !== 'number');
    if (value === undefined || value === '' || (Array.isArray(value) && !value.length) || partialScale) {
      await page.locator('#hopp').click();
    } else if (q.type === 'text') {
      await page.locator(`#tekst-${id}`).fill(value as string);
      await page.locator('#vidare').click();
    } else if (q.type === 'single' || q.type === 'multi') {
      for (const option of Array.isArray(value) ? value : [value]) await page.locator(`.opt[data-id="${option as string}"]`).click();
      if (q.type === 'single' && q.free_text === undefined) {
        const nextId = scenario.path[seen.length];
        if (nextId && nextId !== 'B-intro') await expect(page.locator(`[data-question-id="${nextId}"]`)).toBeVisible();
        else await expect(page.locator(`[data-question-id="${id}"]`)).toHaveCount(0);
      } else await page.locator('#vidare').click();
    } else {
      const rows = q.type === 'nps' ? [{ id: 'nps' }] : q.rows;
      for (const r of rows) {
        const n = q.type === 'nps' ? value : typeof value === 'object' && !Array.isArray(value) ? value[r.id] : undefined;
        if (typeof n !== 'number') throw new Error(`missing synthetic scale value ${id}:${r.id}`);
        await page.locator(`[data-row="${r.id}"]`).getByRole('radio', { name: String(n), exact: true }).click();
      }
      await page.locator('#vidare').click();
    }
  }
  await expect(page.locator('[data-step="review"]')).toBeVisible();
  expect(seen).toEqual(scenario.path);
});
