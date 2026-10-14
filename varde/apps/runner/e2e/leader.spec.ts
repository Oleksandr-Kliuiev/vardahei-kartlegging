import { expect, test } from '@playwright/test';
import notice from '../src/i18n/notice-v2.nn.json' with { type: 'json' };
import { contentFor, draftAt, draftKeyFor, responseRows } from './submission-support.js';

test('leader notice appears before first B question', async ({ page }) => {
  await draftAt(page, 'nn', { K0: 'ZZTEST', K1: 'leiar' }, 'B-intro');
  await expect(page.getByText(notice['notice.common.leader_not_anonymous'])).toBeVisible();
  await expect(page.locator('[data-question-id]')).toHaveCount(0);
  await page.locator('#vidare').click();
  await expect(
    page.locator(`#sp-${contentFor('nn').questions.find((q) => q.part === 'leader')!.id}`),
  ).toBeVisible();
});
test('draft holds independent IDs; identified submission creates two independent rows with the same key', async ({
  page,
}) => {
  await draftAt(page, 'nn', { K0: ' zztest ', K1: 'leiar', L2: ['planlegging'] }, 'review');
  const ids = await page.evaluate(
    (key) =>
      (
        JSON.parse(localStorage.getItem(key)!) as {
          submission_ids: { common: string; leader: string };
        }
      ).submission_ids,
    draftKeyFor('nn'),
  );
  expect(ids.common).not.toBe(ids.leader);
  await page.locator('#send').click();
  await expect(page.locator('.slutt')).toBeVisible();
  const rows = await responseRows(Object.values(ids));
  expect(rows).toHaveLength(2);
  expect(rows.map((r) => r.part).sort()).toEqual(['common', 'leader']);
  for (const row of rows) {
    expect(row.respondent_key).toBe('ZZTEST');
    expect(row.answers).not.toHaveProperty('K0');
  }
});
test('anonymous submission has no key in either part', async ({ page }) => {
  await draftAt(page, 'anonymous', { K1: 'leiar', L2: ['planlegging'] }, 'review');
  const ids = await page.evaluate(
    (key) =>
      Object.values(
        (JSON.parse(localStorage.getItem(key)!) as { submission_ids: Record<string, string> })
          .submission_ids,
      ),
    draftKeyFor('anonymous'),
  );
  await page.locator('#send').click();
  await expect(page.locator('.slutt')).toBeVisible();
  const rows = await responseRows(ids);
  expect(rows).toHaveLength(2);
  for (const row of rows) expect(row.respondent_key).toBeNull();
});
test('Hopp over og send sends only common', async ({ page }) => {
  await draftAt(page, 'nn', { K0: 'ZZTEST', K1: 'leiar' }, 'B-intro');
  const ids = await page.evaluate(
    (key) =>
      Object.values(
        (JSON.parse(localStorage.getItem(key)!) as { submission_ids: Record<string, string> })
          .submission_ids,
      ),
    draftKeyFor('nn'),
  );
  await page.locator('#skip-leader').click();
  await expect(page.locator('.slutt')).toBeVisible();
  expect((await responseRows(ids)).map((r) => r.part)).toEqual(['common']);
});
test('lost leader acknowledgement retries same leader ID without reposting common', async ({
  page,
}) => {
  const sent: { part: string; submission_id: string }[] = [];
  let lost = false;
  await page.route('**/api/runner/submissions', async (route) => {
    const body = route.request().postDataJSON() as { part: string; submission_id: string };
    sent.push(body);
    const response = await route.fetch();
    if (body.part === 'leader' && !lost) {
      lost = true;
      await route.abort();
    } else await route.fulfill({ response });
  });
  await draftAt(page, 'nn', { K0: 'ZZTEST', K1: 'leiar', L2: ['planlegging'] }, 'review');
  await page.locator('#send').click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.reload();
  await page.locator('#send').click();
  await expect(page.locator('.slutt')).toBeVisible();
  expect(sent.map((r) => r.part)).toEqual(['common', 'leader', 'leader']);
  expect(sent[1]!.submission_id).toBe(sent[2]!.submission_id);
  expect(await responseRows(sent.map((r) => r.submission_id))).toHaveLength(2);
});
