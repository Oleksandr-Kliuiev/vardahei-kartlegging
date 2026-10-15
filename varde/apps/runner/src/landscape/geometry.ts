// Landscape geometry for the runner (Vardestien, docs/varde/design/vardestien/sporjeskjema.js).
// SVG user units: the trail climbs from the valley (x0, yb) to the last step (x1, yt) and on to the summit (xs, ys).

export const X0 = 18,
  X1 = 296,
  XS = 326,
  YS = 72,
  YB = 186,
  YT = 80,
  XMIN = -1180,
  XMAX = 1580;

/** Ground height at x. Every step goes up: gentle in the valley, steeper towards the top. */
export function y(x: number): number {
  if (x <= X0) return YB + (X0 - x) * 0.05 + Math.sin(x * 0.05) * 1.2;
  if (x <= X1) {
    const f = (x - X0) / (X1 - X0);
    // The small wave is too weak to make a dip.
    return (
      YB -
      (YB - YT) * (0.55 * f + 0.45 * Math.pow(f, 1.7)) -
      1.4 * Math.sin(f * Math.PI * 5) * f * (1 - f)
    );
  }
  if (x <= XS) {
    const f = (x - X1) / (XS - X1),
      e = f * f * (3 - 2 * f);
    return y(X1) + (YS - y(X1)) * e;
  }
  if (x <= 398) return YS + Math.sin((x - XS) * 0.2) * 0.5;
  return YS + (x - 398) * 0.34;
}

export type Point = readonly [number, number];

/** Points along the ground from a to b. */
export function pts(a: number, b: number, step = 3): Point[] {
  const out: Point[] = [];
  for (let x = a; x < b; x += step) out.push([x, y(x)]);
  out.push([b, y(b)]);
  return out;
}
export const pathD = (p: readonly Point[]): string =>
  'M' + p.map(([x, yy]) => `${x.toFixed(1)},${yy.toFixed(1)}`).join('L');

/** Ridges repeat every 920 units, so the landscape reaches the edges on wide screens. */
export const tile = (a: readonly Point[]): Point[] => [
  ...a.map(([x, yy]): Point => [x - 920, yy]),
  ...a.slice(1),
  ...a.slice(1).map(([x, yy]): Point => [x + 920, yy]),
];
export const FAR: Point[] = [
  [-260, 120],
  [-210, 98],
  [-176, 108],
  [-130, 86],
  [-92, 100],
  [-52, 84],
  [-20, 104],
  [6, 110],
  [34, 96],
  [58, 106],
  [92, 80],
  [122, 94],
  [150, 76],
  [176, 90],
  [212, 62],
  [236, 76],
  [262, 58],
  [298, 82],
  [330, 70],
  [360, 86],
  [392, 66],
  [420, 84],
  [452, 72],
  [490, 92],
  [530, 78],
  [570, 98],
  [610, 84],
  [660, 120],
];
export const SNOW: Point[] = [
  [212, 62],
  [262, 58],
  [392, 66],
  [92, 80],
  [-130, 86],
];
export const MID: Point[] = [
  [-260, 150],
  [-220, 136],
  [-180, 146],
  [-140, 128],
  [-100, 140],
  [-60, 126],
  [-24, 142],
  [0, 146],
  [40, 132],
  [72, 140],
  [112, 118],
  [146, 128],
  [182, 108],
  [222, 122],
  [262, 102],
  [300, 116],
  [338, 96],
  [372, 104],
  [404, 92],
  [440, 108],
  [480, 100],
  [520, 118],
  [570, 108],
  [620, 124],
  [660, 150],
];

/** x of step i when the trail has n steps. */
export const checkX = (i: number, n: number): number => X0 + ((X1 - X0) * i) / Math.max(1, n - 1);

/**
 * A cairn stands where a section ends: a little closer to the next step (62 % of the gap),
 * so the hiker has room to stop before it.
 */
export function cairnBounds(sections: readonly (string | number)[]): { i: number; x: number }[] {
  const n = sections.length,
    out: { i: number; x: number }[] = [];
  for (let i = 1; i < n; i++)
    if (sections[i] !== sections[i - 1]) {
      const a = checkX(i - 1, n),
        b = checkX(i, n);
      out.push({ i, x: a + (b - a) * 0.62 });
    }
  return out;
}

export type CameraMode = 'hero' | 'sti' | 'topp' | 'tilstand';
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const SUBJECT: Record<CameraMode, Box> = {
  hero: { x: -6, y: 0, w: 412, h: 196 },
  sti: { x: -6, y: 40, w: 412, h: 150 },
  topp: { x: 120, y: 0, w: 292, h: 160 },
  tilstand: { x: -6, y: 20, w: 412, h: 176 },
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const HEIGHT: Record<CameraMode, (w: number) => number> = {
  hero: (w) => clamp(w * 0.46, 178, 300),
  sti: (w) => clamp(w * 0.37, 136, 176),
  topp: (w) => clamp(w * 0.56, 210, 280),
  tilstand: (w) => clamp(w * 0.4, 148, 240),
};
export type ViewBox = [number, number, number, number];

/**
 * Camera framing for a box of width w: the subject always fits; wide boxes see more to the sides,
 * narrow ones more sky. Returns the viewBox and the box height in CSS px.
 */
export function fit(mode: CameraMode, w: number): { vb: ViewBox; h: number } {
  const W = w || 360,
    H = HEIGHT[mode](W),
    s = SUBJECT[mode],
    a = W / H,
    sa = s.w / s.h;
  if (a > sa) {
    const vw = s.h * a;
    return { vb: [s.x - (vw - s.w) / 2, s.y, vw, s.h], h: H };
  }
  const vh = s.w / a;
  return { vb: [s.x, s.y - (vh - s.h), s.w, vh], h: H };
}

/** On long trails the strip zooms in around the hiker, so one step stays about this wide on screen. */
export const STEP_PX = 19;
export const ZOOM_MAX = 2.6;

/**
 * Trail camera for `n` steps: the whole trail when steps are wide enough, otherwise a closer window that follows
 * the hiker (he stands at about a third from the left, his feet low in the frame). `z` is the zoom; the hiker,
 * cairns and dots are drawn 1/z as large, so they keep their size on screen.
 */
export function follow(
  base: { vb: ViewBox; h: number },
  w: number,
  n: number,
  hx: number,
): { vb: ViewBox; h: number; z: number } {
  const stepPx = (w / base.vb[2]) * ((X1 - X0) / Math.max(1, n - 1));
  const z = clamp(STEP_PX / stepPx, 1, ZOOM_MAX);
  if (z < 1.01) return { ...base, z: 1 };
  const [bx, by, bw, bh] = base.vb,
    vw = bw / z,
    vh = bh / z;
  const x = clamp(hx - vw * 0.36, bx, bx + bw - vw);
  const top = clamp(y(hx) - vh * 0.72, by, by + bh - vh);
  return { vb: [x, top, vw, vh], h: base.h, z };
}
