import { describe, expect, it } from 'vitest';
import { X0, X1, XS, cairnBounds, checkX, fit, follow, y } from '../src/landscape/geometry.js';
import { gait } from '../src/landscape/walker.js';
import { sectionsOf, trailState } from '../src/trail.js';
import { rendererQuestions } from '../e2e/support.js';
import type { Question } from '@varde/schema/template/question';

describe('trail geometry (1.38)', () => {
  it('every step goes up from the valley to the summit', () => {
    for (let x = X0; x < XS; x += 0.5) expect(y(x + 0.5), `at ${x}`).toBeLessThan(y(x));
  });
  it('steps spread evenly from the first to the last dot', () => {
    expect(checkX(0, 22)).toBe(X0);
    expect(checkX(21, 22)).toBe(X1);
  });
  it('a cairn stands between the last step of a section and the first of the next', () => {
    const b = cairnBounds([0, 0, 1, 1, 1, 2]);
    expect(b.map((c) => c.i)).toEqual([2, 5]);
    for (const c of b) {
      expect(c.x).toBeGreaterThan(checkX(c.i - 1, 6));
      expect(c.x).toBeLessThan(checkX(c.i, 6));
    }
  });
  for (const w of [320, 390, 768, 1024, 1440])
    it(`camera covers the subject without empty edges at ${w} px`, () => {
      for (const mode of ['hero', 'sti', 'topp', 'tilstand'] as const) {
        const { vb, h } = fit(mode, w);
        expect(vb[2] / vb[3]).toBeCloseTo(w / h, 5);
        expect(vb[0]).toBeGreaterThanOrEqual(-1180);
        expect(vb[0] + vb[2]).toBeLessThanOrEqual(1580);
      }
    });
  it('the trail camera follows the hiker on long surveys, so a step stays readable', () => {
    const base = fit('sti', 390);
    expect(follow(base, 390, 14, 20).z).toBe(1);
    const long = follow(base, 390, 40, 150);
    expect(long.z).toBeGreaterThan(2);
    const stepPx = (390 / long.vb[2]) * ((X1 - X0) / 39);
    expect(stepPx).toBeGreaterThan(16);
    expect(long.vb[0]).toBeGreaterThanOrEqual(base.vb[0]);
    expect(long.vb[0] + long.vb[2]).toBeLessThanOrEqual(base.vb[0] + base.vb[2] + 1e-9);
    expect(150).toBeGreaterThan(long.vb[0]);
    expect(150).toBeLessThan(long.vb[0] + long.vb[2]);
  });
  it('walking pace starts and ends softly and never goes backwards', () => {
    let prev = 0;
    for (let p = 0; p <= 1; p += 0.01) {
      expect(gait(p)).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = gait(p);
    }
    expect(gait(0)).toBe(0);
    expect(gait(1)).toBeCloseTo(1, 10);
  });
});

describe('trail state (1.38)', () => {
  const qs = rendererQuestions();
  const leader = (id: string): Question => ({ ...qs[0]!, id, part: 'leader' });
  it('a section starts at a title and where the leader part begins', () => {
    const titled = {
      ...qs[2]!,
      texts: { ...qs[2]!.texts, section_title: { nn: 'Ny del' } },
    } as Question;
    expect(sectionsOf([qs[0]!, qs[1]!, titled, qs[3]!, leader('L1'), leader('L2')])).toEqual([
      0, 0, 1, 1, 2, 2,
    ]);
  });
  it('leader steps are optional until taken and skipped when the respondent sends without them', () => {
    const path = [qs[0]!, qs[1]!, 'B-intro' as const, leader('L1'), leader('L2')];
    const before = trailState(path, 2, { Q1: 'a' }, false, false);
    expect(before.marks).toEqual(['svart', 'hoppa', 'valfri', 'valfri']);
    expect(before.total).toBe(2);
    expect(before.leaderCount).toBe(2);
    const taken = trailState(path, 3, { Q1: 'a' }, false, false);
    expect(taken.marks.slice(2)).toEqual(['att', 'att']);
    expect(taken.total).toBe(4);
    expect(trailState(path, 2, { Q1: 'a' }, true, true).marks.slice(2)).toEqual(['hoppa', 'hoppa']);
  });
});
