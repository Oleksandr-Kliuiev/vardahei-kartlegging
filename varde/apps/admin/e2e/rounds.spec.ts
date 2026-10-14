import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { login, state } from './support.js';

async function newRound(page: Page) {
  await login(page);
  const fixture = await state(page),
    name = `${fixture.mark}-${randomUUID()}`;
  await page.getByRole('link', { name: 'Kundar og rundar', exact: true }).click();
  await page.getByLabel('Namn på runden').fill(name);
  await page.getByLabel('Publisert versjon').selectOption(fixture.version);
  await page.getByRole('button', { name: 'Opprett runde' }).click();
  const round = page.getByRole('region', { name, exact: true });
  await expect(round).toBeVisible();
  await round.getByLabel('Kunde', { exact: true }).selectOption(fixture.client);
  await round.getByLabel('Frist', { exact: true }).fill('2099-06-01');
  await round.getByRole('button', { name: 'Legg til kunde' }).click();
  const client = round.getByRole('article', { name: 'Syntetisk admin kunde' });
  await expect(client.getByText('Ikkje opna', { exact: true })).toBeVisible();
  return { fixture, round, client };
}
test('create from published version, add client, open → journal entry', async ({ page }) => {
  const { client } = await newRound(page);
  await client.getByRole('button', { name: 'Opne', exact: true }).click();
  await expect(client.getByText('Open', { exact: true })).toBeVisible();
  await expect(page.locator('.logg')).toContainText('rounds.client.open');
  await client.getByRole('button', { name: 'Send ut' }).click();
  await expect(client.getByLabel('Tekst til tilsette')).toHaveValue(/Hei alle!/);
  await expect(client.getByRole('link', { name: 'Plakat med QR-kode' })).toHaveAttribute(
    'target',
    '_blank',
  );
});
test('Steng from UI → audit and runner avslutta', async ({ page, context }) => {
  const { client } = await newRound(page);
  await client.getByRole('button', { name: 'Opne', exact: true }).click();
  await expect(client.getByRole('button', { name: 'Send ut' })).toBeVisible();
  await client.getByRole('button', { name: 'Send ut' }).click();
  const link = await client.getByLabel('Lenkje til kartlegginga').inputValue();
  await client.getByRole('button', { name: 'Steng', exact: true }).click();
  await expect(client.getByText('Stengd', { exact: true })).toBeVisible();
  await expect(page.locator('.logg')).toContainText('rounds.client.close');
  const runner = await context.newPage();
  await runner.goto(link);
  await expect(runner.locator('body')).toContainText('avslutta');
  await runner.close();
});
test('Ny kode requires confirmation → audit, old link replaced, new link works', async ({
  page,
  context,
}) => {
  const { client } = await newRound(page);
  await client.getByRole('button', { name: 'Opne', exact: true }).click();
  await expect(client.getByRole('button', { name: 'Send ut' })).toBeVisible();
  await client.getByRole('button', { name: 'Send ut' }).click();
  const linkField = client.getByLabel('Lenkje til kartlegginga');
  const oldLink = await linkField.inputValue();
  const calls: string[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/reissue')) calls.push(r.url());
  });
  await client.getByRole('button', { name: 'Ny kode', exact: true }).click();
  expect(calls).toHaveLength(0);
  await client.getByRole('button', { name: 'Gamle lenkjer sluttar å verke. Stadfest' }).click();
  await expect(linkField).not.toHaveValue(oldLink);
  expect(calls).toHaveLength(1);
  await expect(page.locator('.logg')).toContainText('rounds.code.reissue');
  const runner = await context.newPage();
  await runner.goto(oldLink);
  await expect(runner.locator('body')).toContainText('Lenkja er bytt ut');
  await runner.goto(await linkField.inputValue());
  await expect(runner.locator('body')).not.toContainText('Lenkja er bytt ut');
  await expect(runner.getByRole('button', { name: /Start/ }).first()).toBeVisible();
  await runner.close();
});
test('employee count is editable, new snapshots use it, deadline and invitation languages work', async ({
  page,
  context,
}) => {
  const { client, round, fixture } = await newRound(page);
  const existing = await client.textContent();
  const count = page.getByLabel('Tal tilsette i Syntetisk admin kunde', { exact: true });
  const edited = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/admin/clients/${fixture.client}`) &&
      r.request().method() === 'PATCH' &&
      r.status() === 200,
  );
  await count.fill('24');
  await edited;
  await expect(count).toHaveValue('24');
  expect(await client.textContent()).toBe(existing);
  const other = `${fixture.mark}-${randomUUID()}`;
  await page.getByLabel('Namn på runden').fill(other);
  await page.getByLabel('Publisert versjon').selectOption(fixture.version);
  await page.getByRole('button', { name: 'Opprett runde' }).click();
  const next = page.getByRole('region', { name: other, exact: true });
  await next.getByLabel('Kunde', { exact: true }).selectOption(fixture.client);
  await next.getByLabel('Frist', { exact: true }).fill('2099-06-01');
  await next.getByRole('button', { name: 'Legg til kunde' }).click();
  await expect(next).toContainText('24 tilsette i denne runden');
  await client.getByRole('button', { name: 'Opne', exact: true }).click();
  await client.getByLabel('Frist for Syntetisk admin kunde').fill('2099-07-01');
  await expect(page.locator('.logg')).toContainText('rounds.client.deadline');
  await client.getByRole('button', { name: 'Send ut' }).click();
  await client.getByRole('button', { name: 'English', exact: true }).click();
  await expect(client.getByLabel('Tekst til tilsette')).toHaveValue(/Hi everyone,/);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await client.getByRole('button', { name: 'Kopier tekst' }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toMatch(/Hi everyone,/);
  await client.getByRole('button', { name: 'Kopier lenkje' }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(await client.getByLabel('Lenkje til kartlegginga').inputValue());
  const popup = context.waitForEvent('page');
  await client.getByRole('link', { name: 'Plakat med QR-kode' }).click();
  const poster = await popup;
  await expect(poster.locator('body')).toContainText('Syntetisk admin kunde');
  await poster.close();
  await expect(round).toBeVisible();
});
