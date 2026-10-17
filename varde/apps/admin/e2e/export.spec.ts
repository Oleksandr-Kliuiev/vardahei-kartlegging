import { expect, test } from '@playwright/test';
import { login, personvern, state, submit } from './support.js';

test('export choices download CSV and show the human labels', async ({ page }, info) => {
  await login(page);
  const f = (await state(page)).rounds.dashboard!;
  await submit(page, f.code);
  await personvern(page, 'Eksport');
  await page.getByLabel('Runde', { exact: true }).selectOption(f.id);
  await page.getByLabel('Kunde', { exact: true }).selectOption((await state(page)).client);
  await expect(page.getByRole('link', { name: 'Samla CSV til kunden' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Master_Analyse', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('analyse.csv');
  await page.screenshot({ path: info.outputPath('export.png'), fullPage: true });
});
test('handover shows password once and creates a one-shot encrypted ZIP', async ({ page }) => {
  await login(page);
  const f = await state(page);
  await personvern(page, 'Eksport');
  await page.getByLabel('Kunde', { exact: true }).selectOption(f.client);
  await page.getByLabel('Grunngjeving for utlevering').fill('Syntetisk skriftleg førespurnad');
  await page.getByLabel('Mottakar').fill('Syntetisk mottakar');
  await page.getByRole('button', { name: 'Lag kryptert fil' }).click();
  await expect(page.getByText('Passordet blir vist berre her:', { exact: false })).toBeVisible();
  const link = page.getByRole('link', { name: 'Last ned kryptert ZIP' });
  const url = (await link.getAttribute('href'))!;
  const download = page.waitForEvent('download');
  await link.click();
  expect((await download).suggestedFilename()).toBe('varde-data.zip');
  await expect(page.locator('code')).toHaveCount(0);
  expect((await page.request.get(url)).status()).toBe(404);
});
