import { expect, test } from '@playwright/test';
import { rendererSurvey } from './support.js';
import { draftAt } from './submission-support.js';

const hikerY = async (page: import('@playwright/test').Page) =>
  Number((await page.locator('#landskap .gaar').getAttribute('transform'))?.match(/translate\([\d.]+,([\d.]+)\)/)?.[1]);

test('hiker walks up the trail when a question is answered', async ({ page }) => {
  await rendererSurvey(page);
  await page.waitForTimeout(1200);
  const before = await hikerY(page);
  await page.locator('.opt[data-id="a"]').click();
  await expect(page.locator('#sp-Q2')).toBeVisible();
  await expect.poll(() => hikerY(page)).toBeLessThan(before);
  await expect(page.locator('#landskap .boble')).toContainText('2');
});
test('camp appears only after both requested parts are acknowledged', async ({ page }) => {
  let fail = true;
  await page.route('**/api/runner/submissions', async (route) => {
    const body = route.request().postDataJSON() as { part: string };
    if (body.part === 'leader' && fail) await route.fulfill({ status: 503, json: {} });
    else await route.fulfill({ response: await route.fetch() });
  });
  await draftAt(page, 'nn', { K0: 'ZZTEST', K1: 'leiar' }, 'review');
  await expect(page.locator('.telt, .baal')).toHaveCount(0);
  await page.locator('#send').click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.telt, .baal')).toHaveCount(0);
  fail = false;
  await page.locator('#send').click();
  await expect(page.locator('.slutt')).toBeVisible();
  await expect(page.locator('.telt')).toHaveCount(1);
  await expect(page.locator('.baal')).toHaveCount(1);
  await expect(page.locator('#landskap .boble')).toHaveText('Du er på toppen');
  await expect(page.locator('#landskap')).toHaveAttribute('data-kamera', 'topp');
});
test('reduced motion: nothing moves in the landscape and the camp stands at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await draftAt(page, 'nn', { K0: 'ZZTEST', K1: 'kontor' }, 'review');
  await page.locator('#send').click();
  await expect(page.locator('.slutt')).toBeVisible();
  const styles = await page.locator('#landskap *').evaluateAll((nodes) =>
    nodes.map((node) => {
      const s = getComputedStyle(node);
      return { animation: s.animationName, duration: s.transitionDuration };
    }),
  );
  expect(styles.length).toBeGreaterThan(50);
  for (const s of styles) {
    expect(s.animation).toBe('none');
    expect(s.duration).toBe('0s');
  }
  await expect(page.locator('.telt')).toHaveCSS('opacity', '1');
  await expect(page.locator('.vinkearm')).toHaveCSS('opacity', '0');
});
