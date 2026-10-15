import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { editorFixture } from '../test/editor-fixture.js';
import { login, state } from './support.js';

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
  await customer.getByRole('button', { name: 'Steng', exact: true }).click();
  await expect(customer.getByText('Stengd', { exact: true })).toBeVisible();
  await expect(customer.getByRole('button', { name: 'Opne', exact: true })).toHaveCount(0);
});

test('create template, edit and validate a draft, accept translations, preview without writes, publish and copy', async ({
  page,
  context,
}) => {
  await login(page);
  await page.getByRole('link', { name: 'Skjema', exact: true }).click();
  const key = `e2e_${randomUUID().replaceAll('-', '')}`;
  await page.getByLabel('Nøkkel', { exact: true }).fill(key);
  await page.getByLabel('Identifikasjon', { exact: true }).selectOption('none');
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/admin/surveys') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Opprett skjema', exact: true }).click();
  const v = (await (await created).json()) as { id: string; content_hash: string };
  // Synthetic valid baseline; the remaining operations exercise the actual editor and runner.
  const c = editorFixture().content;
  c.key = key;
  const saved = await page.request.put(`/api/admin/surveys/versions/${v.id}`, {
    data: { content_hash: v.content_hash, content: c },
  });
  expect(saved.status()).toBe(200);
  await page.getByRole('button', { name: 'Hent lagra versjon på nytt' }).click();
  await page.locator('.question-card summary').first().click();
  await page.getByLabel('Spørsmålstekst (nn)', { exact: true }).fill('Kva rolle har du?');
  await page.getByLabel('Spørsmålstekst (en)', { exact: true }).fill('What is your role?');
  // The phone frame in the editor shows the unsaved text at once (1.46).
  const phone = page.frameLocator('iframe[title="Førehandsvising på telefon"]');
  await phone.locator('#start').click();
  await expect(phone.getByRole('heading', { name: 'Kva rolle har du?' })).toBeVisible();
  await page.getByRole('button', { name: 'Lagre utkast', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Utkastet er lagra.' })).toBeVisible();
  for (const lang of ['nn', 'en']) {
    await page.getByRole('button', { name: `Godkjenn ${lang}`, exact: true }).click();
    await expect(
      page.getByRole('button', { name: `Godkjenn ${lang} ✓`, exact: true }),
    ).toBeEnabled();
  }
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
  await page.getByLabel('Eg stadfestar publisering.', { exact: false }).check();
  await page.getByRole('button', { name: 'Publiser versjonen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lagre utkast', exact: true })).toHaveCount(0);
  const template = page
    .locator('section.del')
    .filter({ has: page.getByRole('heading', { name: key, exact: true }) });
  await template.getByLabel('Namn på utkast').fill('v2');
  await template.getByLabel('Utgangspunkt').selectOption(v.id);
  await template.getByRole('button', { name: 'Nytt utkast', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'v2 · Utkast', exact: true })).toBeVisible();
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
