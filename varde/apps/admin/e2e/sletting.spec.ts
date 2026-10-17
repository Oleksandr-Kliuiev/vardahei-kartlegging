import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { login, openRound, personvern, state } from './support.js';

test('submission ID from quotes → preview → confirmed deletion removes the quote', async ({
  page,
}, info) => {
  await login(page);
  const f = (await state(page)).rounds.dashboard!;
  const id = randomUUID();
  expect(
    (
      await page.request.post('/api/runner/submissions', {
        headers: { authorization: `Bearer ${f.code}` },
        data: {
          submission_id: id,
          part: 'common',
          lang: 'nn',
          answers: { F1: 'ZZTEST', F2: 'kontor', F12: 'ja', F22: 'Syntetisk sitat for sletting.' },
        },
      })
    ).status(),
  ).toBe(201);
  const quotes = (await (
    await page.request.get(`/api/admin/rows/quotes?round=${f.id}`)
  ).json()) as { quotes: { submission_id: string; text: string }[] };
  expect(quotes.quotes.find((q) => q.submission_id === id)?.text).toBe(
    'Syntetisk sitat for sletting.',
  );
  await openRound(page, f.name, 'Resultat');
  // Quotes are a detail of the results: folded until opened (2.17).
  await page.locator('summary').filter({ hasText: 'Sitat frå tilsette' }).click();
  const quote = page.locator('li').filter({ hasText: 'Syntetisk sitat for sletting.' });
  await quote.getByText('Innsendings-ID for sletting', { exact: true }).click();
  await expect(quote.locator('code')).toHaveText(id);
  await personvern(page, 'Sletting');
  await page.getByLabel('Område').selectOption('submissions');
  await page.getByLabel('Innsendings-ID-ar').fill(id);
  await page.getByLabel('Grunngjeving').fill('Syntetisk slettingsførespurnad');
  await page.getByRole('button', { name: 'Førehandsvis' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Til saman 1' })).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Du slettar: 1 valt innsending' }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('sletting-preview.png'), fullPage: true });
  // A short press does not delete; holding for 1.2 s does.
  await page.getByRole('button', { name: 'Stadfest sletting' }).click();
  await expect(
    page.getByText('Hald inne knappen i over eitt sekund for å slette.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('Svara er sletta.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Stadfest sletting' }).click({ delay: 1400 });
  await expect(page.getByText('Svara er sletta.')).toBeVisible();
  const after = (await (await page.request.get(`/api/admin/rows/quotes?round=${f.id}`)).json()) as {
    quotes: { submission_id: string }[];
  };
  expect(after.quotes.some((q) => q.submission_id === id)).toBe(false);
});
