// Live questions on the phone (3.6) in a real browser: the open question only, at 360 and 1280 px,
// light and dark, nynorsk and English, no sideways scroll and no request off the site. A tap sends
// the answer at once; a lost acknowledgement is sent again with the same bytes and the database
// keeps one answer. The server seeds a seminar of today whose question L2 is open (e2e/server.cjs).
import { expect, test, type Page } from '@playwright/test';
import { state } from './support.js';
import { responseRows } from './submission-support.js';

function sameOrigin(page: Page) {
  const outside: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) &&
      !['blob:', 'data:'].includes(url.protocol)
    )
      outside.push(r.url());
  });
  return outside;
}
const noSideways = async (page: Page, width: number) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
const link = () => `/r?c=${state().live.code}`;

test('the open question at 360 and 1280 px, light and dark, nynorsk and English', async ({
  page,
}, info) => {
  const outside = sameOrigin(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [
    [360, 760],
    [1280, 800],
  ] as const)
    for (const scheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(link());
      await expect(page.locator('h1')).toHaveText('Brukar du tofaktor (MFA) på jobb-e-posten?');
      await expect(page.locator('.opt')).toHaveCount(3);
      // Nothing of the other questions reaches the phone.
      await expect(page.getByText('Kva arbeider du mest med?')).toHaveCount(0);
      await noSideways(page, width);
      await page.waitForTimeout(300);
      await page.screenshot({
        path: info.outputPath(`live-${width}-${scheme}-nn.png`),
        fullPage: true,
      });
    }
  await page.setViewportSize({ width: 360, height: 760 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(link());
  await page.locator('#sprak-en').click();
  await expect(page.locator('h1')).toHaveText('Do you use two-factor (MFA) on your work e-mail?');
  await expect(page.getByText('Your answer is anonymous and is not linked to you.')).toBeVisible();
  await page.screenshot({ path: info.outputPath('live-360-light-en.png'), fullPage: true });
  expect(outside).toEqual([]);
});

test('a tap sends at once; a lost acknowledgement goes again with the same bytes, one answer kept', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 760 });
  const bytes: string[] = [];
  let lost = false;
  await page.route('**/api/runner/submissions', async (route) => {
    bytes.push(route.request().postData()!);
    const response = await route.fetch();
    if (!lost) {
      lost = true;
      await route.abort();
    } else await route.fulfill({ response });
  });
  await page.goto(link());
  await page.locator('.opt[data-id="nei"]').click();
  await expect(page.getByRole('alert')).toContainText('Svaret kom ikkje fram.');
  // The answer is locked to what was sent; «Prøv igjen» sends the same request again.
  await page.locator('#send').click();
  await expect(page.locator('h1')).toHaveText('Takk!');
  expect(bytes).toHaveLength(2);
  expect(bytes[1]).toBe(bytes[0]);
  const sent = JSON.parse(bytes[0]!) as { submission_id: string; answers: object; part: string };
  expect(sent).toMatchObject({ part: 'common', answers: { L2: 'nei' } });
  const rows = await responseRows([sent.submission_id]);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.respondent_key).toBeNull();
  // A reload of the same phone keeps the thanks: one answer per question from this phone.
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Takk!');
});
