// SVG art for the landscape, drawn once with DOM calls (the scene is animated per frame, outside Preact).
import { FAR, MID, SNOW, XMAX, XMIN, XS, YS, pathD, pts, tile, y, type Point } from './geometry.js';

const NS = 'http://www.w3.org/2000/svg';
type Attrs = Record<string, string | number>;

export function mk<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  parent?: Element,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent?.appendChild(el);
  return el;
}
const polyPoints = (p: readonly Point[]) => p.map((q) => q.join(',')).join(' ');

/** Sky, sun, stars, ridges with snow, and drifting fog for broken links. */
export function drawBackdrop(svg: SVGSVGElement): void {
  const defs = mk('defs', {}, svg);
  // The sky fades into the page background at the top, so there is no hard edge above the summit.
  const lg = mk(
    'linearGradient',
    { id: 'himmel', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 6, x2: 0, y2: 150 },
    defs,
  );
  mk('stop', { offset: '0', 'stop-color': 'var(--bg)' }, lg);
  mk('stop', { offset: '.3', 'stop-color': 'var(--sky-1)' }, lg);
  mk('stop', { offset: '1', 'stop-color': 'var(--sky-2)' }, lg);
  const rg = mk('radialGradient', { id: 'glodgrad' }, defs);
  mk('stop', { offset: '0', 'stop-color': 'var(--glod)', 'stop-opacity': '.8' }, rg);
  mk('stop', { offset: '1', 'stop-color': 'var(--glod)', 'stop-opacity': '0' }, rg);
  const tg = mk('linearGradient', { id: 'takegrad', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
  for (const [o, a] of [
    ['0', 0],
    ['.3', 0.92],
    ['.7', 0.92],
    ['1', 0],
  ] as const)
    mk('stop', { offset: o, 'stop-color': 'var(--take)', 'stop-opacity': a }, tg);
  // Fog drifts as soft bands: blurred, so a band has no hard top or bottom edge.
  const blur = mk(
    'filter',
    { id: 'takeblur', x: '-20%', y: '-80%', width: '140%', height: '260%' },
    defs,
  );
  mk('feGaussianBlur', { stdDeviation: 6 }, blur);

  mk(
    'rect',
    { class: 'kveld', x: XMIN, y: -80, width: XMAX - XMIN, height: 330, fill: 'url(#himmel)' },
    svg,
  );
  // The sun stands over the dip left of the summit (never behind the bubble) and sets towards the ridge.
  mk('circle', { class: 'sol', cx: 228, cy: 42, r: 11 }, svg);
  const stars = mk('g', { class: 'stjerner' }, svg);
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++)
    mk(
      'circle',
      {
        class: `s${i % 7}`,
        cx: (-1100 + rand() * 2600).toFixed(1),
        cy: (4 + rand() * 58).toFixed(1),
        r: i % 3 ? 0.7 : 1.05,
      },
      stars,
    );
  mk(
    'polygon',
    { class: 'as-bak', points: polyPoints([...tile(FAR), [XMAX, 260], [XMIN, 260]]) },
    svg,
  );
  for (const [px, py] of SNOW.flatMap(([px, py]): Point[] => [
    [px - 920, py],
    [px, py],
    [px + 920, py],
  ]))
    mk(
      'polygon',
      {
        class: 'sno',
        points: `${px - 7},${py + 6} ${px},${py} ${px + 7},${py + 5} ${px + 3},${py + 7} ${px},${py + 4} ${px - 3},${py + 8}`,
      },
      svg,
    );
  mk(
    'polygon',
    { class: 'as-midt', points: polyPoints([...tile(MID), [XMAX, 260], [XMIN, 260]]) },
    svg,
  );
  const fog = mk('g', { class: 'take', filter: 'url(#takeblur)' }, svg);
  mk(
    'rect',
    { class: 't1', x: -120, y: 112, width: 420, height: 34, rx: 17, fill: 'url(#takegrad)' },
    fog,
  );
  mk(
    'rect',
    { class: 't2', x: 80, y: 140, width: 460, height: 30, rx: 15, fill: 'url(#takegrad)' },
    fog,
  );
}

/** The ground in front and the dotted trail to the summit. */
export function drawGround(svg: SVGSVGElement): void {
  mk('path', { class: 'as-fram', d: pathD(pts(XMIN, XMAX, 4)) + `L${XMAX},260L${XMIN},260Z` }, svg);
  mk('path', { class: 'sti-att', d: pathD(pts(4, XS, 2)) }, svg);
}

/** Signpost for «this link does not work». */
export function drawSignpost(svg: SVGSVGElement): void {
  const s = mk('g', { class: 'skilt', transform: `translate(30,${y(30).toFixed(1)})` }, svg);
  mk('rect', { x: -0.8, y: -20, width: 1.6, height: 20, fill: 'var(--stamme)' }, s);
  mk('path', { d: 'M-1,-19 h12 l3,2.5 -3,2.5 h-12z', fill: 'var(--stein-lys)' }, s);
  mk('path', { d: 'M1,-12 h-12 l-3,2.5 3,2.5 h12z', fill: 'var(--stein)' }, s);
}

/** Three firs on the summit. */
export function drawTrees(svg: SVGSVGElement): void {
  const g = mk('g', {}, svg);
  for (const [x, h] of [
    [388, 25],
    [380, 19],
    [398, 16],
  ] as const) {
    // The inner group keeps the tree its size when the trail camera zooms in (see Landscape.zoom).
    const t = mk(
        'g',
        { class: 'skaler' },
        mk('g', { transform: `translate(${x},${y(x) + 0.6})` }, g),
      ),
      w = h * 0.62;
    mk(
      'rect',
      { class: 'stamme', x: -h * 0.05, y: -h * 0.16, width: h * 0.1, height: h * 0.18 },
      t,
    );
    for (const [a, b, c] of [
      [0.14, 1, 'gran-a'],
      [0.42, 0.78, 'gran-b'],
      [0.66, 0.55, 'gran-a'],
    ] as const) {
      const by = -h * a,
        bw = (w * b) / 2,
        ty = by - h * 0.44;
      mk('polygon', { class: c, points: `${-bw},${by} 0,${ty} ${bw},${by}` }, t);
    }
  }
}

/** Tent and campfire. Only added when the answers are sent, so they rise in front of the respondent. */
export function drawCamp(parent: Element): SVGGElement {
  const camp = mk('g', { class: 'leir' }, parent);
  const tent = mk(
    'g',
    { class: 'telt' },
    mk('g', { transform: `translate(354,${YS + 0.4})` }, camp),
  );
  mk('polygon', { points: '-12,0 0,-15 12,0', fill: 'var(--telt)' }, tent);
  mk('polygon', { points: '0,-15 12,0 6,0', fill: 'var(--telt-skugge)' }, tent);
  mk('polygon', { points: '-4,0 0,-9.5 4,0', fill: 'var(--telt-dor)' }, tent);
  mk(
    'line',
    {
      x1: 0,
      y1: -15,
      x2: 0,
      y2: -18,
      stroke: 'var(--stein)',
      'stroke-width': 1.2,
      'stroke-linecap': 'round',
    },
    tent,
  );
  const at = mk('g', { transform: `translate(371,${YS + 0.3})` }, camp);
  mk('circle', { class: 'glod', cx: 0, cy: -3, r: 13, fill: 'url(#glodgrad)' }, at);
  const fire = mk('g', { class: 'baal' }, at);
  mk(
    'line',
    {
      x1: -5,
      y1: 0,
      x2: 5,
      y2: -2.4,
      stroke: 'var(--stamme)',
      'stroke-width': 2.2,
      'stroke-linecap': 'round',
    },
    fire,
  );
  mk(
    'line',
    {
      x1: -5,
      y1: -2.4,
      x2: 5,
      y2: 0,
      stroke: 'var(--stamme)',
      'stroke-width': 2.2,
      'stroke-linecap': 'round',
    },
    fire,
  );
  const fl = mk('g', { transform: 'translate(0,-2)' }, fire);
  mk(
    'path',
    {
      class: 'flamme f1',
      d: 'M-4,0 C-5,-4 -2,-6 -1.5,-10 C0.5,-7 4.5,-5 3.6,0 Z',
      fill: 'var(--eld-1)',
    },
    fl,
  );
  mk(
    'path',
    {
      class: 'flamme f2',
      d: 'M-2.6,0 C-3,-3 -0.5,-4.5 0,-7.5 C1.4,-5 3,-3 2.4,0 Z',
      fill: 'var(--eld-2)',
    },
    fl,
  );
  mk(
    'path',
    {
      class: 'flamme f3',
      d: 'M-1.2,0 C-1.4,-1.8 0,-2.6 0.2,-4.4 C1,-3 1.6,-1.8 1.2,0 Z',
      fill: 'var(--eld-3)',
    },
    fl,
  );
  for (const [i, [cx, cy, r, f]] of (
    [
      [0, -10, 0.8, 'var(--eld-2)'],
      [-1.5, -9, 0.7, 'var(--eld-1)'],
      [1.5, -9, 0.7, 'var(--eld-2)'],
    ] as const
  ).entries())
    mk('circle', { class: `gnist g${i + 1}`, cx, cy, r, fill: f }, fire);
  return camp;
}

// A cairn: flat slabs in a tower that narrows upwards, the way cairns look in the mountains.
// The blue slab on top is the hiker's own stone; it is shown once he has placed it.
const SLABS: Point[][] = [
  [
    [-6.9, 5],
    [6.6, 5],
    [6.4, 0.2],
    [6, -2.4],
    [2, -2.9],
    [-6.3, -2.6],
    [-6.7, 0],
  ],
  [
    [-5.9, -2.8],
    [5.5, -3],
    [5.3, -5.6],
    [-0.5, -6],
    [-5.4, -5.5],
  ],
  [
    [-4.6, -5.8],
    [5, -5.9],
    [4.4, -8.3],
    [-4.9, -8],
  ],
  [
    [-4.5, -8.3],
    [3.6, -8.4],
    [3.9, -10.4],
    [-3.8, -10.8],
  ],
  [
    [-3, -10.9],
    [3.4, -10.7],
    [2.9, -12.9],
    [-2.7, -12.7],
  ],
  [
    [-2.4, -13],
    [2, -12.9],
    [1.6, -14.4],
    [-1.9, -14.6],
  ],
];
const OWN_STONE: Point[] = [
  [-1.6, -14.6],
  [1.7, -14.6],
  [1.2, -16],
  [-1.3, -16.1],
];
export const FLYING_STONE: Point[] = [
  [-1.6, 0.7],
  [1.7, 0.7],
  [1.2, -0.7],
  [-1.3, -0.8],
];
/** Height of the top of the own stone over the cairn foot, per unit of k. */
export const CAIRN_TOP = 15.3;
/** Cairns are a little narrower than tall (kx), so the hiker can stand next to one without hiding it. */
export const scaledPoints = (p: readonly Point[], k: number, kx = k): string =>
  p.map(([px, py]) => `${(px * kx).toFixed(2)},${(py * k).toFixed(2)}`).join(' ');

export function drawCairn(parent: Element, k: number): { g: SVGGElement; own: SVGPolygonElement } {
  const g = mk('g', { class: 'varde' }, parent);
  SLABS.forEach((s, i) =>
    mk('polygon', { class: `helle h${i % 3}`, points: scaledPoints(s, k, k * 0.85) }, g),
  );
  const own = mk('polygon', { class: 'min-stein', points: scaledPoints(OWN_STONE, k) }, g);
  return { g, own };
}

export interface HikerParts {
  root: SVGGElement;
  arm: SVGGElement;
}
/** The hiker: legs swing only while he walks; the other arm (behind the body) only shows when he waves. */
export function drawHiker(svg: SVGSVGElement): HikerParts {
  const root = mk('g', { class: 'gaar' }, svg);
  const body = mk('g', { class: 'kropp' }, root);
  const leg = (name: string, opacity: number) => {
    const b = mk('g', { class: `bein ${name}` }, mk('g', { transform: 'translate(0,-8.5)' }, body));
    mk(
      'line',
      {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 8.5,
        stroke: 'var(--ink-strong)',
        'stroke-width': 2.2,
        'stroke-linecap': 'round',
        opacity,
      },
      b,
    );
  };
  leg('b', 0.75);
  mk('rect', { x: -4.6, y: -16.6, width: 3.6, height: 6.4, rx: 1.4, fill: 'var(--sekk)' }, body);
  const wave = mk('g', { class: 'vinkearm' }, mk('g', { transform: 'translate(0.3,-14.4)' }, body));
  mk(
    'line',
    {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: -6.6,
      stroke: 'var(--accent)',
      'stroke-width': 2,
      'stroke-linecap': 'round',
    },
    wave,
  );
  mk('circle', { cx: 0, cy: -7.2, r: 1.1, fill: 'var(--hud)' }, wave);
  mk(
    'line',
    {
      x1: 0,
      y1: -8.5,
      x2: 0.8,
      y2: -15.5,
      stroke: 'var(--accent)',
      'stroke-width': 3.6,
      'stroke-linecap': 'round',
    },
    body,
  );
  leg('a', 1);
  mk(
    'line',
    {
      x1: 4.6,
      y1: -13.5,
      x2: 5.6,
      y2: 0,
      stroke: 'var(--stein)',
      'stroke-width': 1.2,
      'stroke-linecap': 'round',
    },
    body,
  );
  const arm = mk('g', { class: 'arm' }, mk('g', { transform: 'translate(0.8,-14.2)' }, body));
  mk(
    'line',
    {
      x1: 0,
      y1: 0,
      x2: 3.6,
      y2: 3,
      stroke: 'var(--accent)',
      'stroke-width': 2,
      'stroke-linecap': 'round',
    },
    arm,
  );
  mk('circle', { cx: 1.4, cy: -19, r: 2.6, fill: 'var(--hud)' }, body);
  mk('path', { d: 'M-1.3,-19.4 A2.75,2.75 0 0 1 4.1,-19.4 Z', fill: 'var(--lue)' }, body);
  mk('circle', { cx: 1.4, cy: -22.4, r: 1, fill: 'var(--lue)' }, body);
  return { root, arm };
}
/** Shoulder and hand of the front arm in body units (the arm rotates around the shoulder). */
export const SHOULDER: Point = [0.8, -14.2];
export const HAND: Point = [3.6, 3];
