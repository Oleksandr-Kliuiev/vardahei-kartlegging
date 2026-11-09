// «Slett kunden»: a duplicate with nothing tied to it goes after the question; a client with a round
// gets the reason and no delete button.
import { expect, test } from '@playwright/test';
import { login, state } from './support.js';

test('deletes a duplicate after the question and refuses a client with a round', async ({
  page,
}) => {
  await login(page);
  const made = await page.request.post('/api/admin/clients', {
    data: { name: 'ZZ Dublett e2e', employee_count: null },
  });
  expect(made.status()).toBe(201);
  const { id } = (await made.json()) as { id: string };

  await page.goto(`/admin/clients/${id}`);
  await page.getByRole('button', { name: 'Slett kunden' }).click();
  const question = page.getByRole('group', { name: 'Slett ZZ Dublett e2e' });
  await expect(question).toContainText('Det kan ikkje angrast');
  await question.getByRole('button', { name: 'Slett kunden' }).click();
  await expect(page).toHaveURL(/\/admin\/clients$/);
  await expect(page.getByRole('link', { name: /ZZ Dublett e2e/ })).toHaveCount(0);

  const { kunde } = await state(page);
  await page.goto(`/admin/clients/${kunde.client}`);
  await page.getByRole('button', { name: 'Slett kunden' }).click();
  await expect(page.getByRole('group', { name: /^Slett / })).toContainText('kan ikkje slettast');
  await expect(page.getByRole('group', { name: /^Slett / }).getByRole('button')).toHaveText([
    'Lukk',
  ]);
  await page.getByRole('button', { name: 'Lukk' }).click();
  await expect(page.getByRole('button', { name: 'Slett kunden' })).toBeVisible();
});
