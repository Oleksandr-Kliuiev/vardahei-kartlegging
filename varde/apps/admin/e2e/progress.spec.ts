import { expect, test } from '@playwright/test';
import { login, selectProgress, progress, submit } from './support.js';

test('runner events and submissions agree with progress counts, rate, day and median', async ({
  page,
}, info) => {
  await login(page);
  const f = await selectProgress(page, 'progress');
  for (const duration of [60, 120, 180]) await submit(page, f.code, duration);
  for (let i = 0; i < 3; i++) await progress(page, f.code, 4);
  await expect(page.locator('tbody')).toContainText('3 svar');
  await expect(page.locator('tbody')).toContainText('25 %');
  await expect(page.locator('tbody td').nth(2)).toHaveText('3');
  await expect(page.locator('tbody')).toContainText(new Date().toISOString().slice(0, 10));
  await expect(page.locator('tbody')).toContainText('2 min.');
  await page.request.post('/__e2e/age/progress');
  await expect(page.locator('tbody td').nth(3)).toHaveText('3');
  await expect(page.locator('[data-question="4"]')).toHaveText('Spørsmål 4: 3 avbrote');
  await info.attach('progress', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
test('question with two abandoned sessions is hidden, third session makes it visible', async ({
  page,
}) => {
  await login(page);
  const f = await selectProgress(page, 'hidden');
  for (let i = 0; i < 2; i++) await progress(page, f.code, 7);
  await page.request.post('/__e2e/age/hidden');
  await expect(page.locator('[data-question="7"]')).toHaveCount(0);
  await expect(page.locator('tbody td').nth(3)).toHaveText('–');
  await progress(page, f.code, 7);
  await page.request.post('/__e2e/age/hidden');
  await expect(page.locator('[data-question="7"]')).toHaveText('Spørsmål 7: 3 avbrote');
});
test('null population_snapshot → dash and no percentage bar', async ({ page }) => {
  await login(page);
  const f = await selectProgress(page, 'unknown');
  await submit(page, f.code);
  await expect(page.locator('.prosent')).toHaveText('1 svar–');
  await expect(page.getByRole('progressbar')).toHaveCount(0);
});
