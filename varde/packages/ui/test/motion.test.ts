import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countTo, fn, formatNumber, mode, ms, setMotion, spring, tween } from '../src/motion.js';

const sample = (f: (p: number) => number) => Array.from({ length: 201 }, (_, i) => f(i / 200));

describe('motion mode and scale', () => {
  afterEach(() => setMotion('system'));

  it('follows data-motion before the system setting', () => {
    expect(mode()).toBe('full');
    setMotion('slow');
    expect(mode()).toBe('slow');
    expect(ms(100)).toBe(400);
    setMotion('reduced');
    expect(ms(100)).toBe(0);
  });

  it('uses prefers-reduced-motion when data-motion is not set', () => {
    vi.stubGlobal(
      'matchMedia',
      (q: string) => ({ matches: q.includes('reduce') }) as MediaQueryList,
    );
    expect(mode()).toBe('reduced');
    vi.unstubAllGlobals();
  });
});

describe('curves', () => {
  it('start at 0 and end at 1', () => {
    for (const [name, f] of Object.entries(fn)) {
      expect(f(0), name).toBe(0);
      expect(f(1), name).toBe(1);
    }
  });

  it('cubic curves never overshoot and only rise', () => {
    for (const name of ['sti', 'inn', 'ut', 'gang'] as const) {
      const v = sample(fn[name]);
      v.slice(1).forEach((y, i) =>
        expect(y, `${name} at ${i}`).toBeGreaterThanOrEqual(v[i]! - 1e-9),
      );
      expect(Math.max(...v)).toBeLessThanOrEqual(1);
    }
  });

  it('springs overshoot as designed: fjør about 1.5 %, sprett about 15 %', () => {
    expect(Math.max(...sample(fn.fjor))).toBeCloseTo(1.015, 2);
    expect(Math.max(...sample(fn.sprett))).toBeGreaterThan(1.13);
    expect(Math.max(...sample(fn.sprett))).toBeLessThan(1.17);
    expect(spring(0.8)(2)).toBe(1);
  });
});

describe('tween', () => {
  let now = 0;
  let queue: FrameRequestCallback[] = [];
  const frame = (dt: number) => {
    now += dt;
    const run = queue;
    queue = [];
    run.forEach((cb) => cb(now));
  };
  beforeEach(() => {
    now = 0;
    queue = [];
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setMotion('system');
  });

  it('runs from start to end value on animation frames', async () => {
    const seen: number[] = [];
    const t = tween(0, 10, 100, 'linear', (v) => seen.push(v));
    frame(0);
    frame(50);
    frame(60);
    await t;
    expect(seen).toEqual([0, 5, 10]);
  });

  it('tweens lists of numbers', async () => {
    let last: number[] = [];
    const t = tween([0, 100], [10, 0], 100, 'linear', (v) => (last = v));
    frame(0);
    frame(100);
    await t;
    expect(last).toEqual([10, 0]);
  });

  it('cancel stops updates and resolves', async () => {
    const seen: number[] = [];
    const t = tween(0, 10, 100, 'linear', (v) => seen.push(v));
    frame(0);
    t.cancel();
    frame(100);
    await t;
    expect(seen).toEqual([0]);
  });

  it('reduced motion sends the end value at once', async () => {
    setMotion('reduced');
    const seen: number[] = [];
    await tween(0, 10, 500, 'sti', (v) => seen.push(v));
    expect(seen).toEqual([10]);
  });
});

describe('numbers', () => {
  it('formats thousands with a non-breaking space', () => {
    expect(formatNumber(1234567.4)).toBe('1 234 567');
    expect(formatNumber(999)).toBe('999');
  });

  it('countTo ends on the formatted value', async () => {
    setMotion('reduced');
    const el = document.createElement('span');
    el.textContent = '3';
    await countTo(el, 1250);
    expect(el.textContent).toBe('1 250');
    expect(el.dataset['value']).toBe('1250');
    setMotion('system');
  });
});
