// The landscape is the progress bar: the hiker walks the trail, every section ends at a cairn,
// and the tent and campfire wait on the summit. One SVG; a camera moves between intro, trail and summit.
import { animate, ease, reduced, tween, type Tween } from '@varde/ui/motion';
import {
  drawBackdrop,
  drawCairn,
  drawCamp,
  drawGround,
  drawHiker,
  drawSignpost,
  drawTrees,
  mk,
} from './draw.js';
import {
  X1,
  XS,
  YS,
  cairnBounds,
  checkX,
  fit,
  follow,
  pathD,
  pts,
  y,
  type CameraMode,
  type ViewBox,
} from './geometry.js';
import { STOP, Walker, type Cairn, type WalkOptions } from './walker.js';

export type Mark = 'svart' | 'hoppa' | 'att' | 'valfri';
export type Mood = '' | 'take' | 'kveld';

export class Landscape {
  private vb: ViewBox = [0, 0, 400, 200];
  private z = 1;
  private camMoving = false;
  private mode: CameraMode = 'hero';
  private camToken = 0;
  private camTween: Tween | null = null;
  private lastW = 0;
  private n = 0;
  private xs: number[] = [];
  private dots: SVGCircleElement[] = [];
  private cairns: Cairn[] = [];
  private layoutTween: Tween | null = null;
  private bubbleToken = 0;
  private camp: SVGGElement | null = null;
  private readonly pose = { x: 6, done: 6, facing: 1 as 1 | -1, lean: 0 };
  private readonly topCairn: Cairn;
  private readonly walker: Walker;
  private readonly hiker: SVGGElement;
  private readonly gDots: SVGGElement;
  private readonly gCairns: SVGGElement;
  private readonly gCamp: SVGGElement;
  private readonly walked: SVGPathElement;
  private readonly ahead: SVGPathElement;
  private readonly bubbleText: HTMLSpanElement;
  private readonly bubbleNo: HTMLSpanElement;
  private readonly bubbleOf: HTMLSpanElement;
  private readonly bubbleTotal: HTMLSpanElement;
  private readonly ro: ResizeObserver | null;

  constructor(
    private readonly box: HTMLElement,
    private readonly svg: SVGSVGElement,
    private readonly bubbleEl: HTMLElement,
  ) {
    drawBackdrop(svg);
    // Cairns stand behind the ground, so their foot is hidden in the hillside.
    this.gCairns = mk('g', { class: 'varder' }, svg);
    drawGround(svg);
    this.ahead = mk('path', { class: 'sti-fram', d: '' }, svg);
    this.walked = mk('path', { class: 'sti-gjort', d: '' }, svg);
    this.gDots = mk('g', { class: 'prikkar' }, svg);
    drawSignpost(svg);
    drawTrees(svg);
    this.gCamp = mk('g', {}, svg);
    const topPos = mk('g', { transform: `translate(${XS},${YS + 0.4})` }, this.gCairns);
    const top = drawCairn(topPos, 1.12);
    this.topCairn = {
      pos: topPos,
      own: top.own,
      k: 1.12,
      x: XS,
      target: XS,
      stone: false,
      top: true,
    };
    const flying = mk('g', {}, svg);
    const hiker = drawHiker(svg);
    this.hiker = hiker.root;
    this.walker = new Walker(
      svg,
      hiker.arm,
      flying,
      this.pose,
      (withTop) => (withTop ? [...this.cairns, this.topCairn] : this.cairns),
      () => this.place(),
      () => this.z,
    );
    svg.classList.add('kvile');

    const span = (cls: string, parent: Element) => {
      const s = document.createElement('span');
      if (cls) s.className = cls;
      parent.appendChild(s);
      return s;
    };
    bubbleEl.replaceChildren();
    this.bubbleText = span('boble-tekst', bubbleEl);
    this.bubbleNo = span('rull', this.bubbleText);
    this.bubbleText.append(' ');
    this.bubbleOf = span('', this.bubbleText);
    this.bubbleText.append(' ');
    this.bubbleTotal = span('', this.bubbleText);
    bubbleEl.dataset['skjult'] = 'true';

    // Only width changes redraw. The camera tweens the height itself, and that must not be interrupted.
    this.ro =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            const w = this.box.clientWidth;
            if (Math.abs(w - this.lastW) < 1) return;
            this.lastW = w;
            this.camToken++;
            this.camTween?.cancel();
            this.camMoving = false;
            const t = this.frame(this.mode);
            this.apply(t.vb, t.h, t.z);
          })
        : null;
    this.ro?.observe(box);
  }

  destroy(): void {
    this.ro?.disconnect();
    this.camTween?.cancel();
    this.layoutTween?.cancel();
    this.walker.halt();
  }

  get count(): number {
    return this.n;
  }
  checkX(i: number): number {
    return this.xs[i] ?? checkX(i, this.n);
  }
  readonly trailhead = 6;
  readonly endX = X1 + 12;
  readonly summitX = XS + 10.5;
  readonly topStop = XS - STOP;
  get walking(): boolean {
    return this.walker.walking;
  }

  /** Framing for a camera mode; the trail strip follows the hiker on long trails. */
  private frame(mode: CameraMode): { vb: ViewBox; h: number; z: number } {
    const w = this.box.clientWidth || 360,
      base = fit(mode, w);
    return mode === 'sti' ? follow(base, w, this.n, this.pose.x) : { ...base, z: 1 };
  }

  private apply(vb: ViewBox, h: number, z: number): void {
    this.vb = vb;
    this.svg.setAttribute('viewBox', vb.map((k) => k.toFixed(2)).join(' '));
    this.box.style.height = `${h.toFixed(1)}px`;
    this.zoom(z);
    this.draw();
  }

  /** Hiker, cairns, dots and trail lines are drawn 1/z as large, so zooming the camera does not grow them. */
  private zoom(z: number): void {
    if (Math.abs(z - this.z) < 0.0005) return;
    this.z = z;
    this.svg.style.setProperty('--z', z.toFixed(4));
    for (const d of this.dots) d.setAttribute('r', (2.4 / z).toFixed(3));
  }

  camera(mode: CameraMode, instant = false): Promise<void> {
    this.mode = mode;
    this.box.dataset['kamera'] = mode;
    this.lastW = this.box.clientWidth;
    const token = ++this.camToken;
    this.camTween?.cancel();
    if (instant || reduced()) {
      this.camMoving = false;
      const t = this.frame(mode);
      this.apply(t.vb, t.h, t.z);
      return Promise.resolve();
    }
    const from = [...this.vb, this.box.clientHeight || this.frame(mode).h, this.z];
    this.camMoving = true;
    // The target is read every frame: the hiker may walk while the camera moves.
    this.camTween = tween(0, 1, 700, 'sti', (p) => {
      if (token !== this.camToken) return;
      const t = this.frame(mode),
        to = [...t.vb, t.h, t.z],
        v = from.map((a, k) => a + (to[k]! - a) * p);
      this.apply([v[0]!, v[1]!, v[2]!, v[3]!], v[4]!, v[5]!);
    });
    return this.camTween.then(() => {
      if (token === this.camToken) this.camMoving = false;
    });
  }

  /** Each frame of a walk: the following camera moves along, then the hiker, bubble and walked trail. */
  private place(): void {
    if (this.mode === 'sti' && !this.camMoving) {
      const t = this.frame('sti');
      if (
        t.vb.some((k, i) => Math.abs(k - this.vb[i]!) > 0.01) ||
        Math.abs(t.z - this.z) > 0.0005
      ) {
        this.vb = t.vb;
        this.svg.setAttribute('viewBox', t.vb.map((k) => k.toFixed(2)).join(' '));
        this.zoom(t.z);
      }
    }
    this.draw();
  }

  /** Hiker, bubble over his head (it slides aside under the top edge, the arrow keeps pointing at him) and the walked trail. */
  private draw(): void {
    const W = this.box.clientWidth,
      s = W / this.vb[2],
      p = this.pose,
      k = 1.12 / this.z;
    const px = (p.x - this.vb[0]) * s,
      head = (y(p.x) - 27 / this.z - this.vb[1]) * s;
    const bw = this.bubbleEl.offsetWidth || 60,
      bh = this.bubbleEl.offsetHeight || 24;
    const ideal = head - bh - 8,
      missing = Math.max(0, -4 - ideal);
    const top = ideal + missing,
      shift = Math.min(bw / 2 + 12, missing * 3);
    const left = Math.min(W - bw - 4, Math.max(4, px - bw / 2 - shift));
    this.bubbleEl.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
    this.bubbleEl.style.setProperty(
      '--pil',
      `${Math.min(bw - 12, Math.max(12, px - left)).toFixed(1)}px`,
    );
    this.hiker.setAttribute(
      'transform',
      `translate(${p.x.toFixed(2)},${y(p.x).toFixed(2)}) scale(${(k * p.facing).toFixed(3)},${k.toFixed(3)}) rotate(${p.lean.toFixed(2)})`,
    );
    this.walked.setAttribute('d', p.done > 5 ? pathD(pts(4, Math.min(p.done, XS), 2)) : '');
  }

  /**
   * Spread `count` steps over the trail and put a cairn where each section ends. The hiker is not moved:
   * new dots and cairns fade in where they belong, the rest glide calmly to their new places.
   */
  layout(count: number, sections: readonly (string | number)[], instant = false): Promise<void> {
    const oldXs = this.xs.slice(),
      oldN = this.n;
    this.n = count;
    this.xs = Array.from({ length: count }, (_, i) => checkX(i, count));
    const quick = instant || !oldN || reduced();
    const drop = (el: Element) => {
      if (quick) el.remove();
      else
        void animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: ease.ut }).then(
          () => el.remove(),
        );
    };
    const newDots: SVGCircleElement[] = [];
    while (this.dots.length < count) {
      const i = this.dots.length,
        x = this.xs[i]!;
      const c = mk(
        'circle',
        {
          class: 'prikk',
          r: (2.4 / this.z).toFixed(3),
          cx: x.toFixed(2),
          cy: (y(x) - 0.2).toFixed(2),
        },
        this.gDots,
      );
      this.dots.push(c);
      newDots.push(c);
    }
    while (this.dots.length > count) drop(this.dots.pop()!);
    const bounds = cairnBounds(sections.slice(0, count));
    const newCairns: Cairn[] = [];
    while (this.cairns.length < bounds.length) {
      const x = bounds[this.cairns.length]!.x;
      const pos = mk(
        'g',
        { transform: `translate(${x.toFixed(2)},${y(x).toFixed(2)})` },
        this.gCairns,
      );
      const { own } = drawCairn(pos, 1);
      const c: Cairn = { pos, own, k: 1, x, target: x, stone: false, top: false };
      this.cairns.push(c);
      newCairns.push(c);
    }
    while (this.cairns.length > bounds.length) drop(this.cairns.pop()!.pos);
    const fromDots = this.dots.map((_, i) => oldXs[i] ?? this.xs[i]!);
    const fromCairns = this.cairns.map((c) => c.x);
    this.cairns.forEach((c, k) => (c.target = bounds[k]!.x));
    const run = (p: number) => {
      this.dots.forEach((c, i) => {
        const x = fromDots[i]! + (this.xs[i]! - fromDots[i]!) * p;
        c.setAttribute('cx', x.toFixed(2));
        c.setAttribute('cy', (y(x) - 0.2).toFixed(2));
      });
      this.cairns.forEach((c, k) => {
        const x = fromCairns[k]! + (c.target - fromCairns[k]!) * p;
        c.x = x;
        c.pos.setAttribute('transform', `translate(${x.toFixed(2)},${y(x).toFixed(2)})`);
      });
    };
    this.layoutTween?.cancel();
    if (quick) {
      run(1);
      return Promise.resolve();
    }
    // More or fewer steps change how close the trail camera follows: move it there calmly.
    if (this.mode === 'sti' && count !== oldN) void this.camera('sti');
    newDots.forEach(
      (c, j) =>
        void animate(
          c,
          [
            { opacity: 0, transform: 'scale(.4)' },
            { opacity: 1, transform: 'none' },
          ],
          {
            duration: 360,
            delay: 120 + j * 60,
            easing: ease.inn,
            fill: 'backwards',
          },
        ),
    );
    newCairns.forEach(
      (c) =>
        void animate(c.pos, [{ opacity: 0 }, { opacity: 1 }], {
          duration: 420,
          delay: 200,
          easing: ease.inn,
          fill: 'backwards',
        }),
    );
    // A calm re-spacing (in and out of speed), so the cairns ahead glide into place without a jerk.
    this.layoutTween = tween(0, 1, 950, 'gang', run);
    return this.layoutTween;
  }

  marks(states: readonly Mark[]): void {
    this.dots.forEach((c, i) => {
      for (const m of ['svart', 'hoppa', 'valfri'] as const) c.classList.toggle(m, states[i] === m);
    });
  }

  walkTo(x: number, opts?: WalkOptions): Promise<void> {
    return this.walker.walkTo(x, opts);
  }

  /** «N av M» over his head, or a short text. A new width grows or shrinks softly around the arrow. */
  bubble(
    show: boolean,
    content?: { i: number; total: number; of: string } | { text: string },
  ): void {
    const was = this.bubbleEl.dataset['skjult'] === 'false';
    this.bubbleEl.dataset['skjult'] = show ? 'false' : 'true';
    if (!show || !content) return;
    const w0 = this.bubbleEl.offsetWidth,
      before = this.bubbleText.textContent,
      wasCount = this.bubbleTotal.textContent !== '';
    if ('text' in content) {
      this.bubbleNo.textContent = '';
      this.bubbleOf.textContent = content.text;
      this.bubbleTotal.textContent = '';
    } else {
      this.bubbleOf.textContent = content.of;
      this.bubbleTotal.textContent = String(content.total);
      const prev = Number(this.bubbleNo.textContent) || 0;
      if (prev && prev !== content.i)
        void animate(
          this.bubbleNo,
          [
            { transform: `translateY(${content.i > prev ? 8 : -8}px)`, opacity: 0 },
            { transform: 'none', opacity: 1 },
          ],
          {
            duration: 300,
            easing: ease.inn,
          },
        );
      this.bubbleNo.textContent = String(content.i);
    }
    const t = ++this.bubbleToken;
    this.bubbleEl.style.width = '';
    const w1 = this.bubbleEl.offsetWidth;
    if (!was || reduced() || Math.abs(w1 - w0) < 1) {
      this.place();
      return;
    }
    const otherText = 'text' in content ? this.bubbleText.textContent !== before : !wasCount;
    if (otherText)
      void animate(this.bubbleText, [{ opacity: 0 }, { opacity: 1 }], {
        duration: 260,
        delay: 40,
        easing: ease.inn,
        fill: 'backwards',
      });
    this.bubbleEl.style.width = `${w0}px`;
    void tween(w0, w1, 300, 'sti', (w) => {
      if (t !== this.bubbleToken) return;
      this.bubbleEl.style.width = `${w.toFixed(1)}px`;
      this.place();
    }).then(() => {
      if (t !== this.bubbleToken) return;
      this.bubbleEl.style.width = '';
      this.place();
    });
  }

  /** Summit: evening sky, tent and campfire rise. The wave comes when he stands still with the stone laid. */
  finish(on: boolean): void {
    this.svg.classList.toggle('ferdig', on);
    this.box.classList.toggle('ferdig', on);
    if (on && !this.camp) this.camp = drawCamp(this.gCamp);
    if (!on) {
      this.camp?.remove();
      this.camp = null;
      this.svg.classList.remove('vinkar');
    }
  }
  wave(): void {
    this.svg.classList.add('vinkar');
  }
  mood(m: Mood): void {
    this.box.dataset['stemning'] = m;
  }
  /** The optional leader steps: a dotted continuation from the hiker to the summit. */
  preview(on: boolean): void {
    this.box.dataset['forslag'] = on ? 'true' : 'false';
    this.ahead.setAttribute('d', on ? pathD(pts(Math.min(this.pose.x + 4, XS - 4), XS, 2)) : '');
  }
  reset(): void {
    this.walker.halt();
    this.pose.x = 6;
    this.pose.done = 6;
    this.pose.facing = 1;
    this.walker.removeStones([...this.cairns, this.topCairn]);
    this.finish(false);
    this.place();
  }
}
