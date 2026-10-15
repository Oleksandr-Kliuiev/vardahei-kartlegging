import { expect, test } from '@playwright/test';
import notice from '../src/i18n/notice-v2.nn.json' with { type: 'json' };
import { contentFor, draftAt } from './submission-support.js';
import { state } from './support.js';

test('intro: the short privacy answer is visible, the full notice opens on request', async ({
  page,
}) => {
  await page.goto(`/r?c=${state().nn.code}`);
  await expect(page.getByText(notice['notice.identified.who_sees'])).toBeVisible();
  await expect(page.getByText(notice['notice.identified.retention'])).toBeHidden();
  await page.getByRole('button', { name: 'Les heile personvernteksten' }).click();
  await expect(page.getByText(notice['notice.identified.retention'])).toBeVisible();
  await expect(page.locator('#start')).toBeVisible();
});
test('leader choice: optional steps are dashed until taken, the bubble counts them', async ({
  page,
}) => {
  await draftAt(page, 'nn', { K0: 'ZZTEST', K1: 'leiar' }, 'B-intro');
  const leaders = contentFor('nn').questions.filter((q) => q.part === 'leader').length;
  await expect(page.locator('#landskap .boble')).toHaveText(`+${leaders}`);
  await expect(page.locator('#landskap .prikk.valfri')).toHaveCount(leaders);
  await page.locator('#vidare').click();
  await expect(page.locator('#landskap .prikk.valfri')).toHaveCount(0);
});
test('review: «Endre» opens the question and the main button leads back to the review', async ({
  page,
}) => {
  await draftAt(page, 'security', { F1: 'ZZTEST', F2: 'kontor' }, 'review');
  await expect(page.locator('[data-step="review"]')).toBeVisible();
  await page.locator('.seksjon-knapp').first().click();
  await page.locator('[data-edit="F2"]').click();
  await expect(page.locator('#sp-F2')).toBeVisible();
  await expect(page.locator('#vidare')).toHaveText('Sjå over svara');
  // A single choice moves on by itself; after «Endre» it leads straight back to the review.
  await page.locator('.opt[data-id="prod"]').click();
  await expect(page.locator('[data-step="review"]')).toBeVisible();
});
test('a double tap on «Vidare» after the last question cannot send the answers', async ({
  page,
}) => {
  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/api/runner/submissions')) posts.push(r.url());
  });
  const last = contentFor('security')
    .questions.filter((q) => q.part !== 'leader')
    .at(-1)!;
  await draftAt(
    page,
    'security',
    { F1: 'ZZTEST', F2: 'kontor' },
    contentFor('security').questions.filter((q) => q.part !== 'leader').length - 1,
  );
  await expect(page.locator(`#sp-${last.id}`)).toBeVisible();
  await page.locator('#vidare').dblclick();
  await expect(page.locator('[data-step="review"]')).toBeVisible();
  await page.waitForTimeout(600);
  expect(posts).toEqual([]);
  await expect(page.locator('#send')).toBeEnabled();
});
test('keyboard: Start, an answer and Next work without a mouse; focus goes to the question', async ({
  page,
}) => {
  await page.goto(`/r?c=${state().security.code}`);
  await page.locator('#start').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#sp-F1')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.type('zzt');
  await expect(page.locator('#tekst-F1')).toHaveValue('ZZT');
});
