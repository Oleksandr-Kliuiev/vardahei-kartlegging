import { expect, test } from '@playwright/test';
import { rendererSurvey, toMulti, toText } from './support.js';

test('single choice advances after 260 ms', async ({ page }) => {
  await rendererSurvey(page);
  await page.locator('.opt[data-id="a"]').click();
  await expect(page.locator('#sp-Q2')).toBeVisible();
});
test('multi choice maximum blocks extra selection', async ({ page }) => {
  await toMulti(page);
  await page.locator('.opt[data-id="a"]').click();
  await page.locator('.opt[data-id="b"]').click();
  await expect(page.locator('.opt[data-id="c"]')).toBeDisabled();
  await expect(page.locator('.opt[data-id="c"]')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.hjelp')).toContainText('Vel inntil 2.');
});
test('exclusive option clears others; regular option replaces exclusive', async ({ page }) => {
  await toMulti(page);
  await page.locator('.opt[data-id="a"]').click();
  await page.locator('.opt[data-id="ingen"]').click();
  await expect(page.locator('.opt[data-id="a"]')).toHaveAttribute('aria-checked', 'false');
  await page.locator('.opt[data-id="b"]').click();
  await expect(page.locator('.opt[data-id="ingen"]')).toHaveAttribute('aria-checked', 'false');
});
test('text is uppercase and limited to 8 characters', async ({ page }) => {
  await toText(page);
  await page.locator('#tekst-Q3').fill('abcdefghijk');
  await expect(page.locator('#tekst-Q3')).toHaveValue('ABCDEFGH');
});
test('required text needs two characters and cannot be skipped', async ({ page }) => {
  await toText(page);
  await expect(page.locator('#vidare')).toBeDisabled();
  await page.locator('#tekst-Q3').fill('x');
  await expect(page.locator('#vidare')).toBeDisabled();
  await page.locator('#tekst-Q3').fill('xy');
  await expect(page.locator('#vidare')).toBeEnabled();
  await expect(page.locator('#hopp')).toHaveCount(0);
});
test('free text only appears for its configured option', async ({ page }) => {
  await toMulti(page);
  await expect(page.locator('#fri-Q2')).toBeHidden();
  await page.locator('.opt[data-id="anna"]').click();
  await expect(page.locator('#fri-Q2')).toBeVisible();
  await page.locator('.opt[data-id="anna"]').click();
  await expect(page.locator('#fri-Q2')).toBeHidden();
});
