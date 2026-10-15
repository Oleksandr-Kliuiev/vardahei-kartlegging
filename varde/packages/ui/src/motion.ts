// Motion for Varde: easing curves, springs, tweens, FLIP and View Transitions on top of the Web Animations API.
// One scale drives everything (--motion-scale and ms()): slow motion and reduced motion work everywhere.
// Reference: docs/varde/design/vardestien/varde-motion.js.

export type MotionMode = 'full' | 'slow' | 'reduced';
export type EaseName = 'sti' | 'inn' | 'ut' | 'gang' | 'fjor' | 'sprett' | 'linear';
export type Easing = EaseName | ((p: number) => number);

const doc = (): Document | null => (typeof document === 'undefined' ? null : document);
const prefersReduced = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** `data-motion` on <html> (slow, reduced, full) wins over the system setting. */
export function mode(): MotionMode {
  const m = doc()?.documentElement.getAttribute('data-motion');
  if (m === 'slow' || m === 'reduced' || m === 'full') return m;
  return prefersReduced() ? 'reduced' : 'full';
}
export const reduced = (): boolean => mode() === 'reduced';
/** 4 in slow motion, 0 with reduced motion. */
export const scale = (): number => (mode() === 'slow' ? 4 : reduced() ? 0 : 1);
export const ms = (n: number): number => n * scale();

/** Set or clear `data-motion`; `system` follows prefers-reduced-motion. */
export function setMotion(m: MotionMode | 'system'): void {
  const root = doc()?.documentElement;
  if (!root) return;
  if (m === 'system') root.removeAttribute('data-motion');
  else root.setAttribute('data-motion', m);
}
/** Set or clear `data-theme`; `system` follows prefers-color-scheme. */
export function setTheme(t: 'light' | 'dark' | 'system'): void {
  const root = doc()?.documentElement;
  if (!root) return;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}

const FJOR =
  'linear(0, 0.004 1.3%, 0.017 2.5%, 0.036 3.8%, 0.089 6.3%, 0.195 10%, 0.437 17.5%, 0.55 21.3%, 0.652 25%, 0.711 27.5%, 0.764 30%, 0.831 33.8%, 0.885 37.5%, 0.926 41.3%, 0.957 45%, 0.986 50%, 1.002 55%, 1.011 60%, 1.014 72.5%, 1)';
const SPRETT =
  'linear(0, 0.01 1.3%, 0.037 2.5%, 0.078 3.8%, 0.132 5%, 0.263 7.5%, 0.565 12.5%, 0.708 15%, 0.835 17.5%, 0.891 18.8%, 0.986 21.3%, 1.024 22.5%, 1.084 25%, 1.123 27.5%, 1.135 28.7%, 1.147 31.3%, 1.141 35%, 1.116 38.8%, 1.051 46.3%, 1.014 51.2%, 0.995 55%, 0.981 60%, 0.979 67.5%, 1.002 88.8%, 1)';
const linearOk =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('animation-timing-function', 'linear(0, 1)');

/** CSS easing strings, the same values as the --ease-* tokens. */
export const ease: Record<EaseName, string> = {
  sti: 'cubic-bezier(0.2, 0, 0, 1)',
  inn: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  ut: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  gang: 'cubic-bezier(0.45, 0.05, 0.25, 1)',
  fjor: linearOk ? FJOR : 'cubic-bezier(0.2, 0.9, 0.3, 1.02)',
  sprett: linearOk ? SPRETT : 'cubic-bezier(0.3, 1.5, 0.5, 1)',
  linear: 'linear',
};

/** Cubic Bézier as a function of progress, solved with Newton's method. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1,
    bx = 3 * (x2 - x1) - cx,
    ax = 1 - cx - bx;
  const cy = 3 * y1,
    by = 3 * (y2 - y1) - cy,
    ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const e = sx(t) - x,
        d = dx(t);
      if (Math.abs(e) < 1e-5 || !d) break;
      t -= e / d;
    }
    return sy(Math.min(1, Math.max(0, t)));
  };
}

/** Damped spring (ζ < 1) normalised so it settles at p = 1. ζ 0.8 ≈ 1.5 % overshoot, ζ 0.52 ≈ 15 %. */
export function spring(zeta: number): (p: number) => number {
  const wd = Math.sqrt(1 - zeta * zeta);
  const x = (t: number) =>
    1 - Math.exp(-zeta * t) * (Math.cos(wd * t) + (zeta / wd) * Math.sin(wd * t));
  let settle = 0;
  for (let t = 0; t < 120; t += 0.01) if (Math.abs(1 - x(t)) > 0.003) settle = t;
  return (p) => (p >= 1 ? 1 : p <= 0 ? 0 : x(p * settle));
}

/** JS curves for rAF tweens, the same shapes as the CSS tokens. */
export const fn: Record<EaseName, (p: number) => number> = {
  sti: bezier(0.2, 0, 0, 1),
  inn: bezier(0.05, 0.7, 0.1, 1),
  ut: bezier(0.3, 0, 0.8, 0.15),
  gang: bezier(0.45, 0.05, 0.25, 1),
  fjor: spring(0.8),
  sprett: spring(0.52),
  linear: (p) => p,
};

export type AnimateOptions = Omit<KeyframeAnimationOptions, 'easing'> & { easing?: string };

/** Web Animation with Varde defaults; resolves when finished or cancelled. Reduced motion jumps to the end. */
export function animate(
  el: Element | null | undefined,
  keyframes: Keyframe[],
  opts: AnimateOptions = {},
): Promise<void> {
  if (!el || typeof el.animate !== 'function') return Promise.resolve();
  const o: KeyframeAnimationOptions = { duration: 240, easing: ease.sti, fill: 'both', ...opts };
  o.duration = reduced() ? 0 : ms(Number(o.duration ?? 0));
  o.delay = reduced() ? 0 : ms(Number(o.delay ?? 0));
  return el.animate(keyframes, o).finished.then(
    () => undefined,
    () => undefined,
  );
}

/** The same animation on a list, each one `step` ms after the previous (at most `max` steps). */
export function stagger(
  els: Iterable<Element>,
  keyframes: Keyframe[],
  opts: AnimateOptions & { step?: number; max?: number } = {},
): Promise<void> {
  const { step = 36, max = 10, ...rest } = opts;
  const base = Number(rest.delay ?? 0);
  return Promise.all(
    [...els].map((el, i) =>
      animate(el, keyframes, { ...rest, delay: base + Math.min(i, max) * step }),
    ),
  ).then(() => undefined);
}

/** FLIP: measure, change the DOM, then animate each element from its old place with a spring. */
export function flip(
  els: Iterable<Element>,
  mutate: () => void,
  opts: { duration?: number; easing?: string } = {},
): void {
  const list = [...els];
  const first = new Map(list.map((el) => [el, el.getBoundingClientRect()]));
  mutate();
  for (const el of list) {
    if (!el.isConnected) continue;
    const a = first.get(el),
      b = el.getBoundingClientRect();
    if (!a) continue;
    const dx = a.left - b.left,
      dy = a.top - b.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    void animate(el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
      duration: opts.duration ?? 620,
      easing: opts.easing ?? ease.fjor,
      fill: 'none',
    });
  }
}

export type Tween = Promise<void> & { cancel(): void };

/**
 * rAF tween of a number or a list of numbers. `onUpdate` gets the eased value and the raw progress.
 * `cancel()` stops further updates and resolves the promise. Reduced motion sends the end value at once.
 */
export function tween<T extends number | number[]>(
  from: T,
  to: T,
  duration: number,
  easing: Easing,
  onUpdate: (value: T, p: number) => void,
): Tween {
  const f = typeof easing === 'function' ? easing : fn[easing];
  const d = ms(duration);
  let stopped = false,
    frame = 0,
    finish: () => void = () => undefined;
  const a: number | number[] = from,
    b: number | number[] = to;
  const value = (e: number): T =>
    (typeof a === 'number'
      ? a + ((b as number) - a) * e
      : a.map((v, k) => v + ((b as number[])[k]! - v) * e)) as T;
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
    if (d <= 0 || typeof requestAnimationFrame !== 'function') {
      onUpdate(to, 1);
      resolve();
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      if (stopped) return;
      const p = Math.min(1, Math.max(0, (now - start) / d));
      onUpdate(value(f(p)), p);
      if (p < 1) frame = requestAnimationFrame(step);
      else resolve();
    };
    frame = requestAnimationFrame(step);
  });
  return Object.assign(promise, {
    cancel() {
      if (stopped) return;
      stopped = true;
      if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      finish();
    },
  });
}

/** Norwegian number format with a non-breaking space between thousands (12 345). */
export const formatNumber = (v: number): string =>
  String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Numbers that roll to a new value. Screen readers only get the end value (set aria-live on a parent). */
export function countTo(
  el: HTMLElement,
  to: number,
  opts: { duration?: number; easing?: Easing; format?: (v: number) => string } = {},
): Tween {
  const format = opts.format ?? formatNumber;
  const from = Number(el.dataset['value'] ?? el.textContent?.replace(/[^\d.-]/g, '')) || 0;
  el.dataset['value'] = String(to);
  if (from === to) {
    el.textContent = format(to);
    return tween(to, to, 0, 'linear', () => undefined);
  }
  return tween(from, to, opts.duration ?? 700, opts.easing ?? 'inn', (v) => {
    el.textContent = format(v);
  });
}

/** View Transitions when the browser has them and motion is on; otherwise the update runs directly. */
export function viewTransition(update: () => void, className?: string): Promise<void> {
  const d = doc();
  if (!d || typeof d.startViewTransition !== 'function' || reduced()) {
    update();
    return Promise.resolve();
  }
  const root = d.documentElement;
  if (className) root.classList.add(className);
  return d
    .startViewTransition(update)
    .finished.catch(() => undefined)
    .finally(() => {
      if (className) root.classList.remove(className);
    });
}
