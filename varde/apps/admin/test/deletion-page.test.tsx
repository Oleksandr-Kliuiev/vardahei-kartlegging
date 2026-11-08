// The deletion page names what a deletion takes: answers, leader answers and, for a whole client, its
// conversations (2.20), each with the singular right, in the preview and in the receipt.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { answersText, DeletionPage } from '../src/deletion-page.js';
import { button, mount, settle } from './support.js';

describe('answersText', () => {
  const counts = (common: number, leader: number, interviews: number) => ({
    common,
    leader,
    interviews,
  });
  it('names the conversations of a whole client, also when there are none', () => {
    expect(answersText(counts(0, 0, 1), true)).toBe('0 vanlege svar, 0 leiarsvar og 1 samtale');
    expect(answersText(counts(3, 2, 2), true)).toBe('3 vanlege svar, 2 leiarsvar og 2 samtalar');
    expect(answersText(counts(3, 2, 0), true)).toBe('3 vanlege svar, 2 leiarsvar og 0 samtalar');
  });
  it('says one answer in the singular', () => {
    expect(answersText(counts(1, 1, 0), false)).toBe('1 vanleg svar og 1 leiarsvar');
  });
  it('does not mention conversations where the choice does not reach them', () => {
    expect(answersText(counts(2, 0, 0), false)).toBe('2 vanlege svar og 0 leiarsvar');
  });
});

describe('the page', () => {
  let view: ReturnType<typeof mount> | undefined;
  afterEach(() => {
    view?.close();
    view = undefined;
    vi.unstubAllGlobals();
  });
  const pick = (label: string, value: string) => {
    const el = view!.div.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  const write = (label: string, value: string) => {
    const el = view!.div.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${label}"]`)!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  /** One client with one conversation and no answers. */
  const server = () => {
    const fetcher = vi.fn((path: string, init?: RequestInit) => {
      const body = (data: unknown) =>
        Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
      if (path.endsWith('/retention/forget')) {
        const { dry_run } = JSON.parse(init?.body as string) as { dry_run: boolean };
        return body({ dry_run, common: 0, leader: 0, interviews: 1, total: 1 });
      }
      return body(path.endsWith('/clients') ? [{ id: 'k1', name: 'Kunde AS' }] : []);
    });
    vi.stubGlobal('fetch', fetcher);
  };

  it('counts a conversation by name in the preview and in the receipt', async () => {
    server();
    view = mount(<DeletionPage />, true);
    await settle();
    pick('Område', 'client');
    pick('Kunde', 'k1');
    write('Grunngjeving', 'Syntetisk grunn');
    act(() => button(view!.div, 'Førehandsvis').click());
    await settle();
    expect(view.div.textContent).toContain('0 vanlege svar, 0 leiarsvar og 1 samtale. Til saman 1.');
    expect(view.div.textContent).not.toContain('1 innsendingar');
    // The button is held for over a second, with the space bar here.
    const hold = view.div.querySelector<HTMLButtonElement>('button.hald')!;
    act(() => {
      hold.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1300));
    });
    await settle();
    expect(view.div.textContent).toContain('Alle svar frå Kunde AS.');
    expect(view.div.textContent).toContain('0 vanlege svar, 0 leiarsvar og 1 samtale er fjerna.');
    expect(view.div.textContent).not.toContain('1 innsendingar');
  });
});
