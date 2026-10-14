import { expect, test } from '@playwright/test';
import { rendererSurvey, state } from './support.js';

test('changing language during the survey preserves answers', async ({ page }) => {
  await rendererSurvey(page);
  await page.locator('.opt[data-id="a"]').click();
  await expect(page.locator('#sp-Q2')).toBeVisible();
  await page.locator('.opt[data-id="b"]').click();
  await page.locator('#sprak-en').click();
  await expect(page.locator('.opt[data-id="b"]')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#tilbake').click();
  await expect(page.locator('#sp-Q1')).toHaveText('Choose one');
  await expect(page.locator('.opt[data-id="a"]')).toHaveAttribute('aria-checked', 'true');
});
test('Bokmål is absent when not required by the version', async ({ page }) => {
  await page.goto(`/r?c=${state().nn.code}`);
  await expect(page.locator('#start')).toBeVisible();
  await expect(page.locator('#sprak-nb')).toHaveCount(0);
});
test('client default is English', async ({ page }) => {
  await page.goto(`/r?c=${state().en.code}`);
  await expect(page.locator('#start')).toHaveText('Start');
  await expect(page.locator('#sprak-en')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
test('unknown code', async ({ page }) => {
  await page.goto('/r?c=unknown');
  await expect(page.locator('h1')).toHaveText('Lenkja er ikkje gyldig.');
});
test('closed RoundClient', async ({ page }) => {
  await page.goto(`/r?c=${state().closed.code}`);
  await expect(page.locator('h1')).toHaveText('Kartlegginga er avslutta.');
});
