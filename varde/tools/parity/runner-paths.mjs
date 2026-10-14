// Replay exact synthetic answers against the old markup; multi arrays and skipped answers
// require a fixture-aware walker rather than stotte.js::svarAlle's default first choices.
import { chromium } from '@playwright/test';
import { currentBank } from './bank.mjs';
import { runnerScenarios } from './runner-scenarios.mjs';

/** Used with old-server.mjs. Stops before sending, so path capture adds no answers to fixtures. */
export async function walkFixture(page, scenario, capture) {
  const form = currentBank().skjema[scenario.survey];
  await page.locator('#vidare').click();
  const path = [];
  for (let i = 0; i < 80; i += 1) {
    if (capture && await capture(path.length)) return path;
    if (await page.locator('.mellom').count()) {
      path.push('B-intro');
      await page.locator('#vidare').click();
      continue;
    }
    const heading = page.locator('h2.sp');
    if (!(await heading.count())) return path;
    const id = (await heading.getAttribute('id')).slice(3);
    path.push(id);
    const q = form.sporsmal.find((x) => x.id === id);
    const value = scenario.answers[id];
    // The old UI cannot send a scale with a missing row ("Vidare" needs every row), so such a
    // synthetic row is walked as a skip; visibility does not depend on partial scale answers.
    const partialScale =
      q.type === 'scale' && q.rader.some((r) => value === null || typeof value !== 'object' || value[r.id] == null);
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length) || partialScale) {
      await page.locator('#hopp').click();
    } else if (q.type === 'text') {
      await page.locator(`#tekst-${id}`).fill(String(value));
      await page.locator('#vidare').click();
    } else if (q.type === 'single' || q.type === 'multi') {
      for (const option of Array.isArray(value) ? value : [value]) await page.locator(`.opt[data-id="${option}"]`).click();
      if (q.type === 'single' && !q.fritekst) await page.waitForTimeout(300);
      else await page.locator('#vidare').click();
    } else {
      const rows = page.locator('.skala-rad');
      const definitions = q.type === 'nps' ? [{ id: 'nps' }] : q.rader;
      for (let row = 0; row < definitions.length; row += 1) {
        const n = q.type === 'nps' ? value : value[definitions[row].id];
        await rows.nth(row).getByRole('radio', { name: String(n), exact: true }).click();
      }
      await page.locator('#vidare').click();
    }
    // The last old step sends; record no finish UI as a question. A fixture-only interceptor
    // keeps the server's answer file untouched.
  }
  throw new Error(`too many steps for ${scenario.id}`);
}

export async function browserPaths(server, tilgang) {
  const browser = await chromium.launch();
  try {
    const scenarios = [];
    for (const s of runnerScenarios()) {
      const page = await browser.newPage();
      const code = tilgang.daco;
      const origin = new URL(server.base).origin;
      await page.route('**/*', (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      await page.route('**/api/svar', (route) => route.fulfill({ status: 200, json: { ok: true } }));
      await page.goto(`${server.base}/?k=daco&s=${s.survey}&t=${code}`);
      await page.waitForSelector('h1');
      const path = await walkFixture(page, s);
      await page.waitForSelector('.slutt');
      const titles = await page.locator('.slutt section h3').allTextContents();
      const tips = titles.flatMap((title) => currentBank().skjema[s.survey].tips.filter((t) => t.tittel.nn === title).map((t) => t.id));
      scenarios.push({ ...s, path, tips });
      await page.close();
    }
    return { scenarios };
  } finally { await browser.close(); }
}

export function pathsJson(paths) {
  return `{\n  "scenarios": [\n${paths.scenarios.map((s) => `    ${JSON.stringify(s)}`).join(',\n')}\n  ]\n}\n`;
}
