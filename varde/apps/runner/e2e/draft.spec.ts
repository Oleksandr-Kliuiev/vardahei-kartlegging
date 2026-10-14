import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { rendererSurvey, state, toMulti } from './support.js';

const key = () => `varde:${createHash('sha256').update(state().nn.code).digest('hex').slice(0, 16)}:${state().nn.version}`;
test('reload restores answers, step, free text and language', async ({ page }) => {
  await toMulti(page);
  await page.locator('.opt[data-id="anna"]').click();
  await page.locator('#fri-Q2').fill('Syntetisk tekst');
  await page.locator('#sprak-en').click();
  // The draft is saved in a React effect; wait for it so the reload does not race the save.
  await expect.poll(() => page.evaluate((k) => (JSON.parse(localStorage.getItem(k) ?? '{}') as { lang?: string }).lang, key())).toBe('en');
  await page.reload();
  await expect(page.locator('#sp-Q2')).toBeVisible();
  await expect(page.locator('#sprak-en')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.opt[data-id="anna"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#fri-Q2')).toHaveValue('Syntetisk tekst');
});
test('confirmed submission clears draft (Submission API is stubbed until 1.16)', async ({ page }) => {
  await page.route('**/api/runner/submissions', (route) => {
    const input = route.request().postDataJSON() as { submission_id: string };
    return route.fulfill({ status: 201, json: { ok: true, submission_id: input.submission_id } });
  });
  await toMulti(page);
  await page.locator('#hopp').click();
  await page.locator('#tekst-Q3').fill('xy');
  await page.locator('#vidare').click();
  await page.locator('#hopp').click();
  await page.locator('#hopp').click();
  await page.locator('#send').click();
  await expect(page.locator('.slutt')).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), key())).toBeNull();
});
test('draft from another version is removed and ignored', async ({ page }) => {
  const foreign = key().replace(/:[^:]+$/, ':old-version');
  await page.addInitScript((k) => localStorage.setItem(k, JSON.stringify({ answers: { Q1: 'a' }, step: 3, lang: 'en', expires: '2099-01-01' })), foreign);
  await rendererSurvey(page);
  await expect(page.locator('#sp-Q1')).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), foreign)).toBeNull();
});
test('expired draft is removed and answers start fresh', async ({ page }) => {
  await page.addInitScript((k) => localStorage.setItem(k, JSON.stringify({
    answers: { Q1: 'a' }, free: {}, step: 3, lang: 'en', started_at: Date.now(),
    submission_ids: { common: crypto.randomUUID(), leader: crypto.randomUUID() }, expires: '2020-01-01T00:00:00Z',
  })), key());
  await rendererSurvey(page);
  await expect(page.locator('#sp-Q1')).toBeVisible();
  const draft = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}') as { answers?: object; expires?: string }, key());
  expect(draft.answers).toEqual({});
  expect(draft.expires).not.toBe('2020-01-01T00:00:00Z');
});
test('localStorage access denied does not break survey', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }));
  await rendererSurvey(page);
  await page.locator('.opt[data-id="a"]').click();
  await expect(page.locator('#sp-Q2')).toBeVisible();
});
