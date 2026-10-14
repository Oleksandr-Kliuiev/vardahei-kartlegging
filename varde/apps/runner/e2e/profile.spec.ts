import { expect, test } from '@playwright/test';
import { rendererSurvey } from './support.js';
import { draftAt } from './submission-support.js';

test('hiker changes position when a question is answered', async ({ page }) => {
  await rendererSurvey(page);
  const hiker = page.locator('.fjell .gaar'),
    before = await hiker.getAttribute('style');
  await page.locator('.opt[data-id="a"]').click();
  await expect(page.locator('#sp-Q2')).toBeVisible();
  await expect(hiker).not.toHaveAttribute('style', before!);
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
  await expect(page.locator('#fjell-merke')).toHaveText('Du er på toppen');
});
test('reduced motion disables profile animations and transitions, including camp', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await draftAt(page, 'nn', { K0: 'ZZTEST', K1: 'kontor' }, 'review');
  await page.locator('#send').click();
  await expect(page.locator('.slutt')).toBeVisible();
  await expect(page.locator('#fjell')).toHaveAttribute('data-reduced-motion', 'true');
  const styles = await page.locator('#fjell *').evaluateAll((nodes) =>
    nodes.map((node) => {
      const s = getComputedStyle(node);
      return { animation: s.animationName, duration: s.transitionDuration };
    }),
  );
  for (const s of styles) {
    expect(s.animation).toBe('none');
    expect(s.duration).toBe('0s');
  }
  await expect(page.locator('.telt')).toHaveCSS('opacity', '1');
});
