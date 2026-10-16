// Motion of the big screen (3.5), frame by frame: when a result is shown, the bars grow from zero one
// after the other (stagger), never jump between two frames, overshoot at most a hair (the spring
// curve) and stand at their share; the numbers roll up with them and never pass their value. With
// reduced motion everything stands at its value in the first frame. The big screen runs in its
// preview frame (`/p?preview`), fed by postMessage as the admin page does: no database needed.
import { expect, test, type Frame, type Page } from '@playwright/test';

const QR =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 25" shape-rendering="crispEdges" role="img" aria-label="QR-kode"><rect width="100%" height="100%" fill="#fff"/><path d="M2,2h1v1h-1z" fill="#000"/></svg>';
const question = { id: 'L2', no: 2, text: { nn: 'Brukar du tofaktor (MFA) på jobb-e-posten?' } };
const SHARES = [0.55, 0.3, 0.15];
const snapshot = (state: 'closed' | 'released') => ({
  round: 'r-motion',
  seminar: { id: 's', topic: { nn: 'Passord og MFA' }, when: '' },
  languages: ['nn'],
  link: 'http://127.0.0.1/r?c=Abcdefghijklmnopqrstuv',
  qr: QR,
  total: 3,
  questions: [{ ...question, state }],
  current: {
    ...question,
    state,
    multi: false,
    options: ['ja', 'nei', 'veit'].map((id) => ({ id, text: { nn: id } })),
    answered: 20,
    result:
      state === 'released'
        ? {
            class: 'aggregate',
            suppressed: false,
            n: 20,
            options: SHARES.map((share, i) => ({
              id: ['ja', 'nei', 'veit'][i],
              count: share * 20,
              share,
            })),
          }
        : null,
  },
  at: new Date().toISOString(),
});

type Post = (data: unknown) => Promise<void>;
async function screen(page: Page): Promise<{ frame: Frame; post: Post }> {
  await page.setViewportSize({ width: 1300, height: 760 });
  await page.goto('/s');
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.id = 'storskjerm';
    frame.src = '/p?preview=1';
    frame.style.cssText = 'position:fixed;inset:0;width:1280px;height:720px;border:0;z-index:99';
    document.body.appendChild(frame);
  });
  const frame = await (await page.waitForSelector('#storskjerm')).contentFrame();
  await frame!.waitForLoadState();
  await page.waitForTimeout(300);
  const post: Post = (data) =>
    page.evaluate(
      (d) =>
        (document.getElementById('storskjerm') as HTMLIFrameElement).contentWindow!.postMessage(
          d,
          location.origin,
        ),
      data,
    );
  await post({ type: 'varde:storskjerm', snapshot: snapshot('closed') });
  await expect(frame!.locator('.tilstand')).toHaveText('Stengt');
  return { frame: frame!, post };
}

/** Samples every frame: bar widths as a share of their track, and the numbers. */
async function record(page: Page, { frame, post }: { frame: Frame; post: Post }, ms: number) {
  await frame.evaluate((duration) => {
    const w = window as Window & { samples?: { t: number; bars: number[]; nums: string[] }[] };
    w.samples = [];
    const start = performance.now();
    const tick = () => {
      const bars = [...document.querySelectorAll<HTMLElement>('.stolpe')].map((track) => {
        const bar = track.querySelector('i')!;
        return bar.getBoundingClientRect().width / track.getBoundingClientRect().width;
      });
      const nums = [...document.querySelectorAll<HTMLElement>('.prosent')].map(
        (n) => n.textContent ?? '',
      );
      w.samples!.push({ t: performance.now() - start, bars, nums });
      if (performance.now() - start < duration) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, ms);
  await post({ type: 'varde:storskjerm', snapshot: snapshot('released') });
  await page.waitForTimeout(ms + 200);
  return frame.evaluate(() =>
    (
      window as Window & { samples?: { t: number; bars: number[]; nums: string[] }[] }
    ).samples!.filter((s) => s.bars.length > 0),
  );
}

test('bars grow from zero one after the other, never jump, and stand at their share', async ({
  page,
}, info) => {
  const big = await screen(page);
  const title = () =>
    big.frame.locator('.sporsmal-tekst').evaluate((h) => h.getBoundingClientRect().top);
  const before = await title();
  const samples = await record(page, big, 2200);
  // The question stays in its place when the count gives way to the bars.
  expect(Math.abs((await title()) - before)).toBeLessThanOrEqual(1);
  expect(samples.length).toBeGreaterThan(60);
  SHARES.forEach((share, i) => {
    const series = samples.map((s) => s.bars[i]!);
    expect(series[0], `bar ${i} starts at zero`).toBeLessThan(0.02);
    let biggest = 0;
    for (let k = 1; k < series.length; k++)
      biggest = Math.max(biggest, Math.abs(series[k]! - series[k - 1]!));
    expect(biggest, `bar ${i} never jumps`).toBeLessThan(share * 0.25);
    expect(Math.max(...series), `bar ${i} overshoots at most a hair`).toBeLessThan(share * 1.03);
    expect(series.at(-1)!, `bar ${i} ends at its share`).toBeCloseTo(share, 2);
    const nums = samples.map((s) => Number(s.nums[i]!.replace(/\D/g, '')));
    for (let k = 1; k < nums.length; k++)
      expect(nums[k]!, `number ${i} never goes back`).toBeGreaterThanOrEqual(nums[k - 1]!);
    expect(Math.max(...nums), `number ${i} never passes its value`).toBe(Math.round(share * 100));
    // The number follows its bar: never more than a few points apart in any frame.
    const apart = Math.max(
      ...samples.map((s) => Math.abs(Number(s.nums[i]!.replace(/\D/g, '')) / 100 - s.bars[i]!)),
    );
    expect(apart, `number ${i} follows its bar`).toBeLessThan(0.06);
  });
  // One after the other: each bar starts moving later than the one above it.
  const starts = SHARES.map((_, i) => samples.find((s) => s.bars[i]! > 0.01)!.t);
  expect(starts[1]!).toBeGreaterThan(starts[0]!);
  expect(starts[2]!).toBeGreaterThan(starts[1]!);
  await info.attach('frames', { body: JSON.stringify(samples), contentType: 'application/json' });
});

test('slow motion ×4 for the film strip; reduced motion stands still at once', async ({
  page,
}, info) => {
  const { frame, post } = await screen(page);
  await frame.evaluate(() => document.documentElement.setAttribute('data-motion', 'slow'));
  await post({ type: 'varde:storskjerm', snapshot: snapshot('released') });
  for (const at of [0, 400, 800, 1300, 2000, 3600]) {
    await page.waitForTimeout(at === 0 ? 0 : 300);
    await page
      .locator('#storskjerm')
      .screenshot({ path: info.outputPath(`film-${String(at).padStart(4, '0')}.png`) });
  }
  const still = await page.context().browser()!.newPage({ reducedMotion: 'reduce' });
  const samples = await record(still, await screen(still), 300);
  SHARES.forEach((share, i) => {
    expect(samples[0]!.bars[i]!).toBeCloseTo(share, 2);
    expect(samples[0]!.nums[i]).toBe(`${Math.round(share * 100)} %`);
  });
  await still.close();
});
