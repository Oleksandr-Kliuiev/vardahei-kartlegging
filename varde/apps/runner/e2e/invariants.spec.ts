import { expect, test } from '@playwright/test';
import { draftAt, draftKeyFor, responseRows } from './submission-support.js';

test('lost common acknowledgement survives reload with exact request bytes and no duplicate', async ({
  page,
}) => {
  let lost = false;
  const bytes: string[] = [];
  await page.route('**/api/runner/submissions', async (route) => {
    bytes.push(route.request().postData()!);
    const response = await route.fetch();
    if (!lost) {
      lost = true;
      await route.abort();
    } else await route.fulfill({ response });
  });
  await draftAt(
    page,
    'nn',
    { K0: 'ZZTEST', K1: 'kontor', K3: ['ingen'], K16: ['claude'] },
    'review',
  );
  const id = await page.evaluate(
    (k) =>
      (JSON.parse(localStorage.getItem(k)!) as { submission_ids: { common: string } })
        .submission_ids.common,
    draftKeyFor('nn'),
  );
  await page.locator('#send').click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.telt, .baal')).toHaveCount(0);
  await page.reload();
  await page.locator('#send').click();
  await expect(page.locator('.slutt')).toBeVisible();
  expect(bytes).toHaveLength(2);
  expect(bytes[1]).toBe(bytes[0]);
  const rows = await responseRows([id]);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.answers).not.toHaveProperty('K0');
  expect(rows[0]!.answers).not.toHaveProperty('K16');
  expect(await page.evaluate((k) => localStorage.getItem(k), draftKeyFor('nn'))).toBeNull();
});
test('progress request is per-tab and contains no answers, identifiers or submission IDs', async ({
  page,
}) => {
  const payloads: { session_id: string; question_no: number; finished?: boolean }[] = [];
  await page.route('**/api/runner/progress', (route) => {
    payloads.push(route.request().postDataJSON() as (typeof payloads)[number]);
    return route.fulfill({ status: 204 });
  });
  await draftAt(page, 'nn', { K0: 'ZZTEST', K1: 'kontor' }, 0);
  await expect.poll(() => payloads.length).toBeGreaterThan(0);
  await page.locator('#vidare').click();
  await expect.poll(() => payloads.length).toBeGreaterThan(1);
  const id = payloads[0]!.session_id;
  expect(id).toMatch(/^[a-f0-9]{16,32}$/);
  await page.reload();
  await expect.poll(() => payloads.length).toBeGreaterThan(2);
  expect(new Set(payloads.map((p) => p.session_id))).toEqual(new Set([id]));
  for (const p of payloads) {
    expect(Object.keys(p).sort()).toEqual(['question_no', 'session_id']);
    expect(JSON.stringify(p)).not.toContain('ZZTEST');
  }
});
