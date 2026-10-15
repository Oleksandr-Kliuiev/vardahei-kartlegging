// The hiker's walk: a steady pace with short start and stop, uphill lean, and a stop at every cairn he passes,
// where he lifts his stone and lays it on top (the way people add a stone to a cairn in the mountains).
import { ms, reduced, tween, type Tween } from '@varde/ui/motion';
import { CAIRN_TOP, FLYING_STONE, HAND, SHOULDER, mk, scaledPoints } from './draw.js';
import { YS, y } from './geometry.js';

export interface Cairn {
  pos: SVGGElement;
  own: SVGPolygonElement;
  k: number;
  /** Where the cairn stands now (it glides when the trail is re-spaced). */
  x: number;
  /** Where it will stand; stops are planned against this. */
  target: number;
  stone: boolean;
  top: boolean;
}
export interface Pose {
  x: number;
  /** How far the walked (solid) trail reaches. */
  done: number;
  facing: 1 | -1;
  lean: number;
}
export interface WalkOptions {
  instant?: boolean;
  /** Going back or jumping: the walked trail keeps its length. */
  keepDone?: boolean;
  /** Include the summit cairn. */
  top?: boolean;
}

/** He stops this far before a cairn, so both he and the cairn are visible, and reaches out with his arm. */
export const STOP = 9;
const LIFT = -45;
const SCALE = 1.12;
const ACCEL = 0.18,
  DECEL = 0.24,
  VMAX = 1 / (1 - ACCEL / 2 - DECEL / 2);
/** Trapezoid speed profile: short acceleration and braking, no slow start. */
export const gait = (p: number): number =>
  p < ACCEL
    ? (0.5 * VMAX * p * p) / ACCEL
    : p < 1 - DECEL
      ? 0.5 * VMAX * ACCEL + VMAX * (p - ACCEL)
      : 1 - (0.5 * VMAX * (1 - p) * (1 - p)) / DECEL;
const speed = (p: number) => Math.min(1, p / ACCEL, (1 - p) / DECEL);
const cairnX = (c: Cairn) => c.target;
const groundAt = (c: Cairn, x: number) => (c.top ? YS + 0.4 : y(x));

export class Walker {
  private token = 0;
  private stoneToken = 0;
  private placing: { cairn: Cairn; stone: SVGPolygonElement } | null = null;
  private step: Tween | null = null;
  private target: number | null = null;
  private current: Promise<void> = Promise.resolve();

  constructor(
    private readonly svg: SVGSVGElement,
    private readonly arm: SVGGElement,
    private readonly flying: SVGGElement,
    readonly pose: Pose,
    private readonly cairns: (top: boolean) => Cairn[],
    private readonly draw: () => void,
    /** Camera zoom: the hiker and cairns are drawn 1/z as large (see Landscape.zoom). */
    private readonly zoom: () => number = () => 1,
  ) {}

  get walking(): boolean {
    return this.target !== null;
  }

  /** Stopping distance before a cairn; the summit is always seen without zoom. */
  private stop(c: Cairn): number {
    return c.top ? STOP : STOP / this.zoom();
  }

  /** Hand position in SVG units for an arm angle (degrees). */
  private hand(angle: number): [number, number] {
    const r = (angle * Math.PI) / 180,
      c = Math.cos(r),
      s = Math.sin(r);
    const lx = SHOULDER[0] + HAND[0] * c - HAND[1] * s,
      ly = SHOULDER[1] + HAND[0] * s + HAND[1] * c;
    const k = SCALE / this.zoom();
    return [this.pose.x + k * this.pose.facing * lx, y(this.pose.x) + k * ly];
  }

  /** Interrupted while laying a stone (a new answer): the stone stays on the cairn and the arm drops at once. */
  finishStone(): void {
    if (!this.placing) return;
    this.stoneToken++;
    this.placing.cairn.own.classList.add('lagt');
    this.placing.stone.remove();
    this.arm.removeAttribute('transform');
    this.placing = null;
  }

  removeStones(all: Cairn[]): void {
    this.stoneToken++;
    this.placing = null;
    this.flying.replaceChildren();
    this.arm.removeAttribute('transform');
    for (const c of all) {
      c.stone = false;
      c.own.classList.remove('lagt');
    }
  }

  private layStone(c: Cairn, instant = false): Promise<void> {
    if (c.stone) return Promise.resolve();
    c.stone = true;
    if (instant || reduced()) {
      c.own.classList.add('lagt');
      return Promise.resolve();
    }
    const stone = mk(
      'polygon',
      { class: 'flyg-stein', points: scaledPoints(FLYING_STONE, c.k / this.zoom()) },
      this.flying,
    );
    const t = ++this.stoneToken;
    const live = () => t === this.stoneToken;
    // The stone lands where the cairn is now: it may still glide while the trail is re-spaced.
    const top = (): [number, number] => [c.x, groundAt(c, c.x) - (CAIRN_TOP * c.k) / this.zoom()];
    const inHand = (a: number) => {
      const [x, yy] = this.hand(a);
      stone.setAttribute('transform', `translate(${x.toFixed(2)},${(yy - 1.1).toFixed(2)})`);
    };
    const armTo = (a: number) => {
      if (live()) this.arm.setAttribute('transform', `rotate(${a.toFixed(1)})`);
    };
    this.placing = { cairn: c, stone };
    inHand(0);
    return tween(0, LIFT, 320, 'sti', (a) => {
      if (!live()) return;
      armTo(a);
      inHand(a);
    })
      .then(() => {
        if (!live()) return;
        const [x0, y0] = this.hand(LIFT);
        return tween(0, 1, 220, 'inn', (q) => {
          if (!live()) return;
          const [mx, my] = top();
          stone.setAttribute(
            'transform',
            `translate(${(x0 + (mx - x0) * q).toFixed(2)},${(y0 - 1.1 + (my - y0 + 1.1) * q).toFixed(2)})`,
          );
        });
      })
      .then(() => {
        if (!live()) return;
        this.placing = null;
        stone.remove();
        c.own.classList.add('lagt');
        void tween(LIFT, 0, 320, 'sti', armTo);
        return new Promise<void>((r) => setTimeout(r, ms(140)));
      });
  }

  private walkStep(a: number, b: number, token: number, keepDone: boolean): Promise<void> {
    const dist = Math.abs(b - a);
    if (dist < 0.3 || token !== this.token) return Promise.resolve();
    this.svg.classList.add('gaar-no');
    this.svg.classList.remove('kvile');
    const p = this.pose;
    // Speed is the same on screen at every zoom.
    this.step = tween(
      0,
      1,
      Math.min(1400, Math.max(260, dist * this.zoom() * 22)),
      'linear',
      (t) => {
        if (token !== this.token) return;
        const x = a + (b - a) * gait(t);
        p.x = x;
        if (!keepDone) p.done = Math.max(p.done, x);
        const slope = (y(x + 2) - y(x - 2)) / 4;
        p.lean =
          p.facing > 0 ? Math.min(11, Math.max(2, -slope * 34 + 2)) * speed(t) : 3 * speed(t);
        this.draw();
      },
    );
    return this.step.then(() => {
      if (token !== this.token) return;
      this.svg.classList.remove('gaar-no');
      p.lean = 0;
      this.draw();
    });
  }

  walkTo(tx: number, opts: WalkOptions = {}): Promise<void> {
    // Already on the way there: keep walking (no new start in the middle of a step).
    if (this.target !== null && Math.abs(tx - this.target) < 0.5 && !opts.instant)
      return this.current;
    this.finishStone();
    this.step?.cancel();
    const token = ++this.token,
      p = this.pose,
      from = p.x,
      keep = opts.keepDone === true;
    const candidates = this.cairns(opts.top === true);
    p.facing = tx < from - 0.5 ? -1 : 1;
    if (Math.abs(tx - from) < 0.5 || opts.instant || reduced()) {
      p.x = tx;
      p.lean = 0;
      this.target = null;
      if (!keep) {
        p.done = Math.max(p.done, tx);
        for (const c of candidates)
          if (cairnX(c) - this.stop(c) <= p.x + 0.01) void this.layStone(c, true);
      }
      this.arm.removeAttribute('transform');
      this.svg.classList.remove('gaar-no');
      this.draw();
      return (this.current = Promise.resolve());
    }
    this.target = tx;
    // Cairns ahead whose middle lies inside this walk: stop before each one (or where he stands, if already close).
    const stops =
      p.facing > 0
        ? candidates
            .filter(
              (c) => !c.stone && cairnX(c) > from + 1 && cairnX(c) - this.stop(c) <= tx + 0.01,
            )
            .sort((a, b) => cairnX(a) - cairnX(b))
        : [];
    this.current = (async () => {
      let x0 = from;
      for (const c of stops) {
        const at = Math.max(x0, cairnX(c) - this.stop(c));
        await this.walkStep(x0, at, token, keep);
        if (token !== this.token) return;
        await this.layStone(c);
        if (token !== this.token) return;
        x0 = at;
      }
      await this.walkStep(x0, tx, token, keep);
    })().then(() => {
      if (token !== this.token) return;
      this.target = null;
      p.lean = 0;
      p.facing = 1;
      this.svg.classList.add('kvile');
      this.draw();
    });
    return this.current;
  }

  /** Stop at once where he stands (screen reset). */
  halt(): void {
    this.finishStone();
    this.step?.cancel();
    this.token++;
    this.target = null;
    this.pose.lean = 0;
    this.svg.classList.remove('gaar-no');
  }
}
