import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Fold, FoldAll, FoldProvider } from '../src/fold.js';
import { mount } from './support.js';

let view: ReturnType<typeof mount>;
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  });
});
afterEach(() => {
  view.close();
  vi.unstubAllGlobals();
});

const blocks = () => [...view.div.querySelectorAll('details')];
const toggle = (d: HTMLDetailsElement, open: boolean) =>
  act(() => {
    d.open = open;
    d.dispatchEvent(new Event('toggle'));
  });

it('folds a block, remembers it, and folds or opens all blocks at once', () => {
  view = mount(
    <FoldProvider>
      <FoldAll />
      <Fold title="Soner">a</Fold>
      <Fold title="Sitat">b</Fold>
    </FoldProvider>,
  );
  expect(blocks().map((d) => d.open)).toEqual([true, true]);
  toggle(blocks()[0]!, false);
  expect(blocks().map((d) => d.open)).toEqual([false, true]);
  expect(JSON.parse(localStorage.getItem('varde:dash-fold')!)).toEqual({ Soner: true });
  const click = (label: string) =>
    act(() => {
      [...view.div.querySelectorAll('button')].find((b) => b.textContent === label)!.click();
    });
  click('Opne alle');
  expect(blocks().map((d) => d.open)).toEqual([true, true]);
  click('Fold alle');
  expect(blocks().map((d) => d.open)).toEqual([false, false]);
});

it('starts folded when the browser remembers it, and works without a provider', () => {
  localStorage.setItem('varde:dash-fold', JSON.stringify({ Sitat: true }));
  view = mount(
    <FoldProvider>
      <Fold title="Soner">a</Fold>
      <Fold title="Sitat">b</Fold>
    </FoldProvider>,
  );
  expect(blocks().map((d) => d.open)).toEqual([true, false]);
  view.close();
  view = mount(<Fold title="Alene">x</Fold>);
  expect(blocks()[0]!.open).toBe(true);
});
