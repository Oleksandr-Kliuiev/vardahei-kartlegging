import { webcrypto } from 'node:crypto';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Survey } from '../src/survey.js';
import { rendererQuestions, syntheticContent } from '../e2e/support.js';
import type { RunnerRound } from '../src/round.js';

const root = document.createElement('div');
const memory = new Map<string, string>();
const round: RunnerRound = {
  round_client_id: 'synthetic-client', client: { name: 'Syntetisk kunde', default_lang: 'nn' },
  version: { id: 'v1', label: 'v1', identification: 'none', required_languages: ['nn', 'en'],
    content: { ...syntheticContent(), questions: rendererQuestions(), leader_roles: [] } },
  status: 'open', deadline: '2099-06-01', expires: '2099-06-01T22:00:00Z',
};
beforeEach(() => {
  history.replaceState(null, '', '/r?c=synthetic');
  memory.clear();
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('localStorage', {
    get length() { return memory.size; }, key: (i: number) => [...memory.keys()][i] ?? null,
    getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => { memory.set(k, v); }, removeItem: (k: string) => { memory.delete(k); },
  });
});
afterEach(() => { render(null, root); vi.unstubAllGlobals(); });
async function start() {
  await act(() => { render(<Survey round={round} />, root); });
  await vi.waitFor(() => expect(root.querySelector('#start')).not.toBeNull());
  await act(() => { root.querySelector<HTMLButtonElement>('#start')!.click(); });
}
async function click(selector: string) { await act(() => { root.querySelector<HTMLButtonElement>(selector)!.click(); }); }
it('answers and language survive unmount/reload at the current question', async () => {
  await start();
  await click('.opt[data-id="a"]');
  await vi.waitFor(() => expect(root.querySelector('#sp-Q2')).not.toBeNull());
  await click('.opt[data-id="b"]');
  await click('#sprak-en');
  render(null, root);
  await act(() => { render(<Survey round={round} />, root); });
  await vi.waitFor(() => expect(root.querySelector('#sp-Q2')).not.toBeNull());
  expect(root.querySelector('.opt[data-id="b"]')!.getAttribute('aria-checked')).toBe('true');
  expect(root.querySelector('#sprak-en')!.getAttribute('aria-pressed')).toBe('true');
});
it('a rejected submission keeps the draft; matching 201 confirmation removes it', async () => {
  await start();
  await click('#hopp');
  await click('#hopp');
  const input = root.querySelector<HTMLInputElement>('#tekst-Q3')!;
  await act(() => { input.value = 'xy'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await click('#vidare'); await click('#hopp'); await click('#hopp');
  expect(root.querySelector('[data-step="review"]')).not.toBeNull();
  const fetcher = vi.fn().mockResolvedValue({ status: 500 });
  vi.stubGlobal('fetch', fetcher);
  await click('#send');
  await vi.waitFor(() => expect(root.querySelector('[role="alert"]')).not.toBeNull());
  expect(memory.size).toBe(1);
  fetcher.mockImplementation((_url: string, request: RequestInit) => {
    const body = JSON.parse(request.body as string) as { submission_id: string };
    return Promise.resolve({ status: 201, json: () => Promise.resolve({ ok: true, submission_id: body.submission_id }) });
  });
  await click('#send');
  await vi.waitFor(() => expect(root.querySelector('.slutt')).not.toBeNull());
  expect(memory.size).toBe(0);
});
