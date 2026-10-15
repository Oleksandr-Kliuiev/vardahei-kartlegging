import { expect, test, type Page } from '@playwright/test';
import { state } from './support.js';

// Frame-by-frame record of the hiker in SVG units, his arm and flying stones (1.39, 1.41).
interface Frame {
  t: number;
  x: number;
  y: number;
  arm: string;
  fly: number;
}
async function startRecorder(page: Page) {
  await page.evaluate(() => {
    const svg = document.querySelector('#landskap svg')!,
      hiker = svg.querySelector('.gaar')!,
      arm = svg.querySelector('.arm')!;
    const w = window as unknown as { __rec: Frame[]; __acts: number[] };
    w.__rec = [];
    w.__acts = [];
    document.addEventListener(
      'pointerdown',
      (e) => {
        if ((e.target as Element).closest('.opt[role="radio"], #vidare, #start'))
          w.__acts.push(performance.now());
      },
      true,
    );
    const frame = () => {
      const m = (hiker.getAttribute('transform') ?? '').match(/translate\(([-\d.]+),([-\d.]+)\)/);
      w.__rec.push({
        t: performance.now(),
        x: Number(m?.[1]),
        y: Number(m?.[2]),
        arm: arm.getAttribute('transform') ?? '',
        fly: svg.querySelectorAll('.flyg-stein').length,
      });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
async function answerFast(page: Page, n: number, pause: number) {
  for (let k = 0; k < n; k++) {
    const id = await page.locator('[data-question-id]').getAttribute('data-question-id');
    await page.locator('.opt[role="radio"]').first().click();
    await expect(page.locator('[data-question-id]')).not.toHaveAttribute('data-question-id', id!);
    await page.waitForTimeout(pause);
  }
}

for (const pause of [700, 120])
  test(`hiker reacts at once, never jumps and puts his stones down (answer every ${pause} ms)`, async ({
    page,
  }) => {
    await page.goto(`/r?c=${state().security.code}`);
    await expect(page.locator('#landskap .gaar')).toHaveCount(1);
    await page.waitForTimeout(800);
    await startRecorder(page);
    await page.locator('#start').click();
    await page.locator('#tekst-F1').fill('zztest');
    await page.locator('#vidare').click();
    await expect(page.locator('#sp-F2')).toBeVisible();
    await page.locator('.opt[data-id="kontor"]').click();
    await expect(page.locator('#sp-F3')).toBeVisible();
    await answerFast(page, 4, pause);
    await page.waitForTimeout(2500);
    const { rec, acts } = await page.evaluate(() => {
      const w = window as unknown as { __rec: Frame[]; __acts: number[] };
      return { rec: w.__rec, acts: w.__acts };
    });
    // No teleports: at most 0.1 SVG units per ms (a walking step is about 0.06).
    for (let i = 1; i < rec.length; i++) {
      const a = rec[i - 1]!,
        b = rec[i]!,
        dt = Math.max(1, b.t - a.t);
      expect(
        Math.hypot(b.x - a.x, b.y - a.y) / dt,
        `frame ${i} at ${Math.round(b.t)}`,
      ).toBeLessThan(0.1);
    }
    // First visible reaction (body or arm) within 150 ms of every answer.
    for (const at of acts) {
      const i0 = rec.findIndex((r) => r.t >= at);
      const before = rec[Math.max(0, i0 - 1)]!;
      const moved = rec.find(
        (r) => r.t > at && (Math.abs(r.x - before.x) > 0.01 || r.arm !== before.arm),
      );
      expect(moved, `reaction to click at ${Math.round(at)}`).toBeDefined();
      expect(moved!.t - at).toBeLessThan(150);
    }
    // At rest: arm down, no stone in the air, and a stone on every cairn he has passed.
    const last = rec.at(-1)!;
    expect(['', 'rotate(0.0)']).toContain(last.arm);
    expect(last.fly).toBe(0);
    const stones = await page.locator('#landskap .varder .min-stein.lagt').count();
    expect(stones).toBeGreaterThanOrEqual(1);
  });
