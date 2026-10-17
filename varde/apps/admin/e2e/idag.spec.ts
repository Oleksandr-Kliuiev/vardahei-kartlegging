// «I dag» (2.17): what waits now links to where the work is done — a deadline within a week opens the
// reminder on the round page — and «Hald fram» opens the survey on the question where work stopped.
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { login, menu, newSurvey, state } from './support.js';

/** A local calendar date `n` days from today, as the deadline field writes it. */
function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

test('a deadline within a week opens the reminder for that client on the round page', async ({
  page,
}) => {
  await login(page);
  const f = await state(page);
  const made = await page.request.post('/api/admin/rounds/launch', {
    data: {
      name: `${f.mark}-frist-${randomUUID()}`,
      template_version_id: f.version,
      open: true,
      clients: [{ client_id: f.client, deadline: inDays(2) }],
    },
  });
  expect(made.status()).toBe(201);
  const { id, round_client_ids } = (await made.json()) as {
    id: string;
    round_client_ids: string[];
  };
  const rc = round_client_ids[0]!;
  await page.reload();
  const item = page.locator(`a.ting[href="/admin/rounds/${id}/utsending?kunde=${rc}"]`);
  await expect(item).toContainText('Syntetisk admin kunde: fristen er om 2 dagar');
  await expect(item).toContainText(
    /\d+ av \d+ har svart\. Hent påminning og send ho til leiaren\./,
  );
  await item.click();
  await expect(page).toHaveURL(new RegExp(`/admin/rounds/${id}/utsending\\?kunde=${rc}$`));
  const card = page.getByRole('article', { name: 'Syntetisk admin kunde' });
  await expect(card.getByRole('button', { name: 'Påminning', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(card.getByLabel('Tekst til tilsette')).toHaveValue(
    /^Hugs å svare på undersøkinga innan/,
  );
});

test('«Hald fram» opens the survey on the question where the work stopped', async ({ page }) => {
  const v = await newSurvey(page);
  await page.locator('.vk-sti [data-sel="R"]').click();
  await expect(page.locator('.vk-sti [data-sel="R"]')).toHaveAttribute('aria-current', 'true');
  await menu(page, 'I dag');
  const hald = page.getByRole('region', { name: 'Hald fram' });
  await expect(hald).toContainText('Du var på R');
  await hald.getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`/admin/surveys/${v.id}$`));
  await expect(page.locator('.vk-sti [data-sel="R"]')).toHaveAttribute('aria-current', 'true');
});
