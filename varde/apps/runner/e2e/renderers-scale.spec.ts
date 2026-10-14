import { expect, test } from '@playwright/test';
import { toScale } from './support.js';

test('scale needs every row and displays low/high labels and free text', async ({ page }) => {
  await toScale(page);
  await page.locator('[data-row="a"] button').filter({ hasText: /^1$/ }).click();
  await expect(page.locator('#vidare')).toBeDisabled();
  await expect(page.locator('.skala-endar').first()).toContainText('Låg');
  await expect(page.locator('.skala-endar').first()).toContainText('Høg');
  await page.locator('#fri-Q4').fill('Syntetisk tekst');
  await page.locator('[data-row="b"] button').filter({ hasText: /^5$/ }).click();
  await expect(page.locator('#vidare')).toBeEnabled();
});
for (const n of [0, 10]) test(`NPS accepts ${n}`, async ({ page }) => {
  await toScale(page);
  await page.locator('#hopp').click();
  await page.locator('.skala-knappar button').filter({ hasText: new RegExp(`^${n}$`) }).click();
  await expect(page.locator('#vidare')).toBeEnabled();
  await expect(page.locator('.skala-knappar button[aria-checked="true"]')).toHaveText(String(n));
});
