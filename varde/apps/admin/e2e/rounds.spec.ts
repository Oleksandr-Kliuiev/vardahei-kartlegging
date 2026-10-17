import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { login, menu, openRound, state } from './support.js';

/** A round without clients from the wizard (2.17), then one client added on its own page. */
async function newRound(page: Page) {
  await login(page);
  const fixture = await state(page),
    name = `${fixture.mark}-${randomUUID()}`;
  await menu(page, 'Rundar');
  await page.getByRole('button', { name: 'Start ein runde', exact: true }).click();
  await page.getByLabel('Namn på den nye runden').fill(name);
  await page.getByLabel('Versjon for den nye runden').selectOption(fixture.version);
  await page.getByRole('button', { name: 'Opprett runden utan kundar' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  const round = page.getByRole('region', { name: 'Kundar i runden', exact: true });
  await round.getByLabel('Kunde', { exact: true }).selectOption(fixture.client);
  await round.getByLabel('Frist', { exact: true }).fill('2099-06-01');
  await round.getByRole('button', { name: 'Legg til kunde' }).click();
  const client = round.getByRole('article', { name: 'Syntetisk admin kunde' });
  await expect(client.getByText('Ikkje opna', { exact: true })).toBeVisible();
  return { fixture, round, client, name };
}
test('create from published version, add client, open → journal entry', async ({ page }) => {
  const { client } = await newRound(page);
  await client.getByRole('button', { name: 'Opne', exact: true }).click();
  await expect(client.getByText('Open', { exact: true })).toBeVisible();
  await expect(page.locator('.logg')).toContainText('Kunde opna for svar');
  await client.getByRole('button', { name: 'Hent invitasjon' }).click();
  await expect(client.getByLabel('Tekst til tilsette')).toHaveValue(/Hei alle!/);
  await expect(client.getByRole('link', { name: 'Plakat med QR-kode' })).toHaveAttribute(
    'target',
    '_blank',
  );
});
test('Steng from UI → audit and runner avslutta', async ({ page, context }) => {
  const { client } = await newRound(page);
  await client.getByRole('button', { name: 'Opne', exact: true }).click();
  await expect(client.getByRole('button', { name: 'Hent invitasjon' })).toBeVisible();
  await client.getByRole('button', { name: 'Hent invitasjon' }).click();
  const link = await client.getByLabel('Lenkje til kartlegginga').inputValue();
  await client.getByRole('button', { name: 'Steng for svar', exact: true }).click();
  await expect(client.getByText('Stengd for svar', { exact: true })).toBeVisible();
  await expect(page.locator('.logg')).toContainText('Kunde stengd');
  const runner = await context.newPage();
  await runner.goto(link);
  await expect(runner.locator('body')).toContainText('avslutta');
  await runner.close();
});
test('Ny lenkje requires confirmation → audit, old link replaced, new link works', async ({
  page,
  context,
}) => {
  const { client } = await newRound(page);
  await client.getByRole('button', { name: 'Opne', exact: true }).click();
  await expect(client.getByRole('button', { name: 'Hent invitasjon' })).toBeVisible();
  await client.getByRole('button', { name: 'Hent invitasjon' }).click();
  const linkField = client.getByLabel('Lenkje til kartlegginga');
  const oldLink = await linkField.inputValue();
  const calls: string[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/reissue')) calls.push(r.url());
  });
  await client.getByRole('button', { name: 'Ny lenkje', exact: true }).click();
  expect(calls).toHaveLength(0);
  await client.getByRole('button', { name: 'Gamle lenkjer sluttar å verke. Stadfest' }).click();
  await expect(linkField).not.toHaveValue(oldLink);
  expect(calls).toHaveLength(1);
  await expect(page.locator('.logg')).toContainText('Ny lenkje laga');
  const runner = await context.newPage();
  await runner.goto(oldLink);
  await expect(runner.locator('body')).toContainText('Lenkja er bytt ut');
  await runner.goto(await linkField.inputValue());
  await expect(runner.locator('body')).not.toContainText('Lenkja er bytt ut');
  await expect(runner.getByRole('button', { name: /Start/ }).first()).toBeVisible();
  await runner.close();
});
test('employee count is edited on the client page, new snapshots use it, deadline and invitation languages work', async ({
  page,
  context,
}) => {
  const { client, fixture, name } = await newRound(page);
  // The head count of a round is a snapshot: editing the client later never changes it.
  const existing = await client.locator('.kundekort-topp small').textContent();
  await page.goto(`/admin/clients/${fixture.client}`);
  await page.getByRole('button', { name: 'Endre namn og tal tilsette' }).click();
  const edited = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/admin/clients/${fixture.client}`) &&
      r.request().method() === 'PUT' &&
      r.status() === 200,
  );
  await page.getByLabel('Tal tilsette', { exact: true }).fill('24');
  await page.getByRole('button', { name: 'Lagre kunde', exact: true }).click();
  await edited;
  await expect(page.locator('.rom-topp')).toContainText('24 tilsette');
  await openRound(page, name, 'Utsending');
  const first = page.getByRole('article', { name: 'Syntetisk admin kunde' });
  await expect(first.locator('.kundekort-topp small')).toHaveText(existing!);
  const other = `${fixture.mark}-${randomUUID()}`;
  await menu(page, 'Rundar');
  await page.getByRole('button', { name: 'Start ein runde', exact: true }).click();
  await page.getByLabel('Namn på den nye runden').fill(other);
  await page.getByLabel('Versjon for den nye runden').selectOption(fixture.version);
  await page.getByRole('button', { name: 'Opprett runden utan kundar' }).click();
  const next = page.getByRole('region', { name: 'Kundar i runden', exact: true });
  await expect(page.getByRole('heading', { name: other, level: 1 })).toBeVisible();
  await next.getByLabel('Kunde', { exact: true }).selectOption(fixture.client);
  await next.getByLabel('Frist', { exact: true }).fill('2099-06-01');
  await next.getByRole('button', { name: 'Legg til kunde' }).click();
  await expect(next).toContainText('24 tilsette i denne runden');
  await openRound(page, name, 'Utsending');
  await first.getByRole('button', { name: 'Opne', exact: true }).click();
  await first.getByLabel('Frist for Syntetisk admin kunde').fill('2099-07-01');
  await expect(page.locator('.logg')).toContainText('Frist endra');
  await first.getByRole('button', { name: 'Hent invitasjon' }).click();
  await first.getByRole('button', { name: 'English', exact: true }).click();
  await expect(first.getByLabel('Tekst til tilsette')).toHaveValue(/Hi everyone,/);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await first.getByRole('button', { name: 'Kopier tekst' }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toMatch(/Hi everyone,/);
  await first.getByRole('button', { name: 'Kopier lenkje' }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(await first.getByLabel('Lenkje til kartlegginga').inputValue());
  const popup = context.waitForEvent('page');
  await first.getByRole('link', { name: 'Plakat med QR-kode' }).click();
  const poster = await popup;
  await expect(poster.locator('body')).toContainText('Syntetisk admin kunde');
  await poster.close();
  await expect(first).toBeVisible();
});
test('closing a whole round needs a 1.2 s hold; a short press only explains', async ({ page }) => {
  const { round, client } = await newRound(page);
  await client.getByRole('button', { name: 'Opne', exact: true }).click();
  await expect(client.getByText('Open', { exact: true })).toBeVisible();
  const close = round.getByRole('button', { name: 'Avslutt heile runden' });
  await close.click();
  await expect(round.getByRole('status')).toContainText('Hald inne knappen');
  await page.waitForTimeout(1500);
  await expect(page.locator('.rom-topp')).toContainText('Open');
  await close.click({ delay: 1400 });
  await expect(page.locator('.rom-topp')).toContainText('Avslutta');
});
