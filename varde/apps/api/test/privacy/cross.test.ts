// privacy/cross.ts (release rule 7, BACKLOG «до этапа 4» 16.10): the cut search on hand-made
// client × role structures; the random attack tests are in subtraction-attack.test.ts.
import { describe, expect, it } from 'vitest';
import { cellToHide, smallCut, type View } from '../../src/modules/privacy/privacy.service.js';

const structure = (t: Record<string, string[]>) =>
  new Map(Object.entries(t).map(([c, rs]) => [c, new Set(rs)]));
const view = (total: number | undefined, clients: object, roles: object): View => ({
  total,
  clients: new Map(Object.entries(clients) as [string, number][]),
  roles: new Map(Object.entries(roles) as [string, number][]),
});

describe('smallCut', () => {
  it('the task example: role:r1 − client:k1 = k0', () => {
    const s = structure({ k0: ['r1'], k1: ['r1'], k2: ['r0'], k3: ['r0'], k4: ['r0'] });
    expect(smallCut(s, [view(10, { k1: 4 }, { r1: 5 })], 3)).toMatchObject({ n: 1 });
    expect(smallCut(s, [view(10, { k1: 4 }, {})], 3)).toBeNull();
  });

  it('only closed sets count: a client minus a role it only partly shares is no group', () => {
    // a: 4 in x, 3 in y; b: 5 in y. client:a − role:x = 3 is a's y-cell (n = 3, not below k);
    // client:a − role:y = 7 − 8 = −1 is not a set: b's y-cell is in role y but not in client a.
    const s = structure({ a: ['x', 'y'], b: ['y'] });
    expect(smallCut(s, [view(12, { a: 7, b: 5 }, { x: 4, y: 8 })], 3)).toBeNull();
  });

  it('without a total the two hidden remainders move together (tie)', () => {
    // a: 4 in x, b: 1 in x; only client:a is visible. With the total, b = total − a = 1.
    const s = structure({ a: ['x'], b: ['x'] });
    expect(smallCut(s, [view(5, { a: 4 }, {})], 3)).toMatchObject({ n: 1 });
    // Without it the hidden clients stay with the hidden roles: nothing is determined.
    expect(smallCut(s, [view(undefined, { a: 4 }, {})], 3)).toBeNull();
    // A role that covers everyone is a total too.
    expect(smallCut(s, [view(undefined, { a: 4 }, { x: 5 })], 3)).toMatchObject({ n: 1 });
  });

  it('differences: without a total now, the new answers of a hidden client stay unknown', () => {
    // k0 gets 2 answers without a role; k1 keeps 2 in r0. Then: total 2, k1 2, r0 2, r1 0.
    const s = structure({ k0: [''], k1: ['r0'] });
    const then = view(2, { k1: 2 }, { r0: 2, r1: 0 });
    expect(smallCut(s, [then, view(undefined, { k1: 2 }, { r1: 0 })], 3)).toBeNull();
    // With the total now, k0 = 4 − 2 and before 2 − 2: two new answers, determined.
    expect(smallCut(s, [then, view(4, { k1: 2 }, { r1: 0 })], 3)).toMatchObject({ n: 2 });
  });

  it('differences on a structure in two pieces: each piece has its own total', () => {
    // k1 only in r1; k0, k2 only in r0. Then only the total (5); now r0 (4) and k1 (3) without
    // the total — together they are the total again: 7 − 5 = the two new answers of k0.
    const s = structure({ k0: ['r0'], k1: ['r1'], k2: ['r0'] });
    const then = view(5, {}, {});
    expect(smallCut(s, [then, view(undefined, { k1: 3 }, { r0: 4 })], 3)).toMatchObject({ n: 2 });
    // One piece alone is not the total: r0 without k1 tells nothing about the whole.
    expect(smallCut(s, [then, view(undefined, {}, { r0: 4 })], 3)).toBeNull();
  });

  it('too many role nodes to search: a role cell is asked for (fail closed)', () => {
    const roles = Array.from({ length: 14 }, (_, i) => `r${i}`);
    const s = structure({ a: roles, b: roles });
    const now = view(40, { a: 20, b: 20 }, Object.fromEntries(roles.map((r) => [r, 3])));
    expect(smallCut(s, [now], 3)?.roles.length).toBe(14);
    expect(cellToHide(smallCut(s, [now], 3)!, now)).toMatch(/^role:/);
  });

  it('a difference may be negative: an answer deleted between two releases', () => {
    const s = structure({ a: ['x'], b: ['y'] });
    const then = view(10, { a: 5, b: 5 }, { x: 5, y: 5 });
    const now = view(9, { a: 5, b: 4 }, { x: 5, y: 4 });
    expect(smallCut(s, [then, now], 3)).toMatchObject({ n: -1 });
  });
});

describe('cellToHide', () => {
  const cut = { clients: ['a', '#clients:0'], roles: ['#roles:0'], n: 1 };
  const now = view(12, { a: 4, b: 5 }, { x: 6, y: 3 });
  it('values shown now: a role, never a client or the total, even when the cut has no role', () => {
    expect(cellToHide(cut, now)).toBe('role:y');
  });
  it('differences: a cell of the cut first, as rule 2 carries', () => {
    expect(cellToHide(cut, now, true)).toBe('client:a');
    expect(cellToHide({ ...cut, roles: ['x', '#roles:0'] }, now, true)).toBe('role:x');
  });
});
