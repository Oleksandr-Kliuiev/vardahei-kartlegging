import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { login, newSurvey, state } from './support.js';

test('wizard creates a client and launches an open round with an invitation; closed clients have no reopen action', async ({
  page,
}) => {
  await login(page);
  const f = await state(page);
  await page.getByRole('link', { name: 'Kundar og rundar', exact: true }).click();
  const name = `Syntetisk ${randomUUID()}`,
    roundName = `Runde ${randomUUID()}`;
  const clients = page.locator('section.del').filter({
    has: page.getByRole('heading', { name: 'Legg til eller endre kunde', exact: true }),
  });
  await clients.getByLabel('Kundenamn', { exact: true }).first().fill(name);
  await clients.getByLabel('Tal tilsette', { exact: true }).first().fill('12');
  await clients.getByRole('button', { name: 'Opprett kunde', exact: true }).click();
  const wizard = page
    .locator('section.del')
    .filter({ has: page.getByRole('heading', { name: 'Start ein runde', exact: true }) });
  await wizard.getByLabel('Namn på den nye runden').fill(roundName);
  await wizard.getByLabel('Versjon for den nye runden').selectOption(f.version);
  await wizard.getByRole('checkbox', { name, exact: true }).check();
  await expect(wizard.getByLabel(`Tilsette i runden for ${name}`, { exact: true })).toHaveValue(
    '12',
  );
  await wizard.getByLabel(`Frist for ${name}`, { exact: true }).fill('2099-01-01');
  await wizard.getByLabel('Opne med ein gong', { exact: true }).check();
  await wizard.getByRole('button', { name: 'Start runden', exact: true }).click();
  await expect(wizard.getByLabel('Lenkje til kartlegginga')).toHaveValue(/\/r\?c=/);
  const round = page.getByRole('region', { name: roundName, exact: true });
  await expect(round.getByText('12 tilsette i denne runden')).toBeVisible();
  const customer = round.getByRole('article', { name, exact: true });
  await customer.getByRole('button', { name: 'Steng for svar', exact: true }).click();
  await expect(customer.getByText('Stengd for svar', { exact: true })).toBeVisible();
  await expect(customer.getByRole('button', { name: 'Opne', exact: true })).toHaveCount(0);
});

test('create a survey, write it in the workshop, accept both languages, preview without writes, publish and open the next draft', async ({
  page,
  context,
}) => {
  const v = await newSurvey(page);
  await page.locator('.vk-sti [data-sel="R"]').click();
  await page.getByLabel('Spørsmålet', { exact: true }).fill('Kva rolle har du?');
  // The phone stands on the chosen question and shows the text before it is saved (1.46, 2.15).
  const phone = page.frameLocator('iframe[title="Førehandsvising på telefon"]');
  await expect(phone.getByRole('heading', { name: 'Kva rolle har du?' })).toBeVisible();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.locator('textarea.vk-stor').fill('What is your role?');
  await page.getByRole('button', { name: 'Nynorsk', exact: true }).click();
  await expect(page.locator('.vk-lagring')).toHaveText(/^Lagra kl\. \d\d\.\d\d$/);
  const preview = await context.newPage();
  const writes: string[] = [];
  preview.on('request', (r) => {
    if (r.method() !== 'GET') writes.push(r.url());
  });
  await preview.goto(`/r?preview=${v.id}`);
  await expect(preview.getByText('Førehandsvising — ingen svar blir lagra')).toBeVisible();
  await preview.locator('#start').click();
  await expect(preview.getByRole('heading', { name: 'Kva rolle har du?' })).toBeVisible();
  await preview.getByRole('radio', { name: 'Test', exact: true }).click();
  await preview.getByRole('button', { name: 'Sjå avslutninga' }).click();
  expect(writes).toEqual([]);
  await preview.close();
  await page.getByRole('button', { name: /Gjer klar til publisering/ }).click();
  const panel = page.locator('.vk-skuff');
  await panel.getByRole('button', { name: 'Eg har lese korrektur', exact: true }).click();
  await expect(panel.getByText(/^Godkjend /)).toHaveCount(1);
  await panel.getByRole('button', { name: 'Godkjenn English', exact: true }).click();
  await expect(panel.getByText(/^Godkjend /)).toHaveCount(2);
  await panel.getByRole('button', { name: 'Hald inne for å publisere v1' }).click({ delay: 1400 });
  await expect(panel.getByText('v1 er publisert', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Tilbake til skjemaet', exact: true }).click();
  await expect(page.getByText(/^v1 er publisert og låst/)).toBeVisible();
  await expect(page.getByLabel('Spørsmålet', { exact: true })).not.toBeEditable();
  await page.getByRole('button', { name: 'Lag utkast v2', exact: true }).click();
  await expect(page.locator('.vk-tittel .chip')).toHaveText(/^Utkast v2/);
  await expect(page.locator('.vk-base')).toContainText('Bygd på v1');
  await expect(page.getByLabel('Spørsmålet', { exact: true })).toHaveValue('Kva rolle har du?');
});

test('360 px admin forms and employee tables stay inside the viewport', async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await login(page);
  // On narrow screens the menu is a drawer behind the menu button.
  await expect(page.getByRole('link', { name: 'Kundar og rundar', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Opne menyen' }).click();
  await page.getByRole('link', { name: 'Kundar og rundar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kundar og rundar', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.getByRole('button', { name: 'Opne menyen' }).click();
  await page.getByRole('link', { name: 'Dashbord', exact: true }).click();
  const f = await state(page);
  await page.getByLabel('Runde', { exact: true }).selectOption(f.rounds.dashboard!.id);
  await expect(page.getByRole('heading', { name: 'Svar per tilsett', exact: true })).toBeVisible();
  const wrap = page
    .locator('.del')
    .filter({ has: page.getByRole('heading', { name: 'Svar per tilsett', exact: true }) })
    .locator('.tabell-wrap');
  expect(await wrap.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await wrap.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  expect(await wrap.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await info.attach('admin-360', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
