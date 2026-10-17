import { expect, test } from '@playwright/test';
import { login, state } from './support.js';

// The survey inside the phone preview is only 300 px wide; small phones are 320 px. No sideways scroll.
test('survey preview has no sideways scroll on 300 and 320 px screens', async ({ page }) => {
  await login(page);
  const s = await state(page);
  for (const width of [300, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/r?preview=${s.version}`);
    await expect(page.getByRole('button', { name: /^Start/ })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${width}px`).toBeLessThanOrEqual(0);
  }
});
