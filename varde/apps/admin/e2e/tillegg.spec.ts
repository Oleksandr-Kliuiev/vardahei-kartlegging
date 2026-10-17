// 2.18: what went out by hand is marked on the client card and in the round's journal; a note on a
// question stays, marks the trail and can be solved; «Hent» puts a ready question into the survey.
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { login, newSurvey, state } from './support.js';

test('a sent invitation is marked on the client card and in the round journal, and can be taken back', async ({
  page,
}) => {
  await login(page);
  const f = await state(page);
  const made = await page.request.post('/api/admin/rounds/launch', {
    data: {
      name: `${f.mark}-sendt-${randomUUID()}`,
      template_version_id: f.version,
      open: true,
      clients: [{ client_id: f.client, deadline: '2099-06-01' }],
    },
  });
  expect(made.status()).toBe(201);
  const { id } = (await made.json()) as { id: string };
  await page.goto(`/admin/rounds/${id}/utsending`);
  const card = page.getByRole('article', { name: 'Syntetisk admin kunde' });
  await card
    .getByRole('button', { name: 'Merk invitasjonen til Syntetisk admin kunde som sendt' })
    .click();
  await expect(card.locator('.sendt-ja')).toContainText('Sendt');
  await expect(page.locator('.logg')).toContainText('Merkt som sendt');
  await card
    .getByRole('button', { name: 'Angre at invitasjonen til Syntetisk admin kunde er sendt' })
    .click();
  await expect(card.locator('.sendt-ja')).toHaveCount(0);
});

test('a note on a question stays after a reload, marks the trail and is solved; «Hent» adds a ready question', async ({
  page,
}) => {
  await newSurvey(page);
  await page.locator('.vk-sti [data-sel="R"]').click();
  await page.getByLabel('Ny kommentar').fill('Kan vi seie dette enklare?');
  await page.getByRole('button', { name: 'Legg til kommentar' }).click();
  await expect(page.locator('.vk-kommentar')).toContainText('Kan vi seie dette enklare?');
  await expect(page.locator('.vk-sti [data-sel="R"] .vk-notat')).toHaveText('1');
  await page.reload();
  await expect(page.locator('.vk-sti [data-sel="R"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.vk-kommentar')).toContainText('Kan vi seie dette enklare?');
  await page.getByRole('button', { name: 'Merk som løyst' }).click();
  await expect(page.locator('.vk-sti [data-sel="R"] .vk-notat')).toHaveCount(0);
  await expect(page.getByText('1 løyst kommentar')).toBeVisible();
  const rows = await page.locator('.vk-sti [data-sel]').count();
  await page.locator('.vk-seksjon.aktiv').getByRole('button', { name: 'Hent' }).click();
  await page.locator('.vk-bank-val', { hasText: 'Kor sannsynleg' }).click();
  await expect(page.locator('.vk-sti [data-sel]')).toHaveCount(rows + 1);
  await expect(page.locator('.vk-sti [aria-current="true"]')).toContainText('Kor sannsynleg');
});
