// 3.6 (unit, jsdom): a phone in a seminar live poll. It waits for the first question, shows only
// the open one, sends a single choice as soon as it is tapped (one request, the same bytes on a
// retry), thanks after the answer, says «Spørsmålet er stengt» when a question closed first, and
// thanks at the end. The draft lives under the code's prefix; the new texts are nynorsk.
import { webcrypto } from 'node:crypto';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { findBokmal } from '@varde/schema/i18n/nn-stoplist';
import { setMotion } from '@varde/ui/motion';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nn from '../src/i18n/ui.nn.json';
import { LivePoll, liveScreen } from '../src/live/live.js';
import type { LiveView } from '../src/live/live-api.js';

const CODE = 'Abcdefghijklmnopqrstuv';
const root = document.createElement('div');
document.body.appendChild(root);
const memory = new Map<string, string>();

const topic = { nn: 'Passord og MFA' };
const open = (id = 'L2', type: 'single' | 'multi' = 'single'): LiveView => ({
  state: 'open',
  languages: ['nn'],
  topic,
  no: 2,
  total: 3,
  question: {
    id,
    part: 'common',
    type,
    texts: { text: { nn: 'Brukar du tofaktor?' } },
    options: [
      { id: 'ja', texts: { text: { nn: 'Ja' } } },
      { id: 'nei', texts: { text: { nn: 'Nei' } } },
    ],
  } as never,
});
const between: LiveView = { state: 'between', languages: ['nn'], topic };

let view: LiveView;
let posts: { body: string; headers: Record<string, string> }[];
let answer: () => Promise<{ status: number; json: () => Promise<unknown> }>;
const json = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

beforeEach(() => {
  setMotion('reduced');
  history.replaceState(null, '', `/r?c=${CODE}`);
  memory.clear();
  posts = [];
  view = { state: 'waiting', languages: ['nn'], topic };
  answer = () => json(201, { ok: true });
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('localStorage', {
    get length() {
      return memory.size;
    },
    key: (i: number) => [...memory.keys()][i] ?? null,
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memory.set(k, v);
    },
    removeItem: (k: string) => {
      memory.delete(k);
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/runner/live') return json(200, view);
      posts.push({ body: init!.body as string, headers: init!.headers as Record<string, string> });
      return answer();
    }),
  );
});
afterEach(async () => {
  await act(() => render(null, root));
  vi.unstubAllGlobals();
});

/** The next poll at once (the page also polls when it becomes visible again). */
const poll = () =>
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
const title = () => root.querySelector('h1')?.textContent;
async function start() {
  await act(() => render(<LivePoll code={CODE} />, root));
  await vi.waitFor(() => expect(title()).toBe('Vent litt'));
}

describe('a phone in the live poll', () => {
  it('waits, gets the open question only, sends a tap at once and thanks', async () => {
    await start();
    expect(root.textContent).toContain('Det første spørsmålet kjem straks.');
    view = open();
    await poll();
    await vi.waitFor(() => expect(title()).toBe('Brukar du tofaktor?'));
    expect(root.textContent).toContain('Spørsmål 2 av 3');
    await act(() => root.querySelector<HTMLElement>('.opt[data-id="ja"]')!.click());
    await vi.waitFor(() => expect(title()).toBe('Takk!'));
    expect(posts).toHaveLength(1);
    expect(posts[0]!.headers.Authorization).toBe(`Bearer ${CODE}`);
    expect(JSON.parse(posts[0]!.body)).toMatchObject({
      part: 'common',
      lang: 'nn',
      answers: { L2: 'ja' },
    });
    // The draft keeps the answer under the code's prefix (removed with the code's drafts).
    const [key, stored] = [...memory.entries()][0]!;
    expect(key).toMatch(/^varde:[0-9a-f]{16}:live$/);
    expect(JSON.parse(stored)).toMatchObject({ items: { L2: { confirmed: true, value: 'ja' } } });
    // The question closes: still thanks, and the next one comes by itself.
    view = between;
    await poll();
    await vi.waitFor(() =>
      expect(root.textContent).toContain('Neste spørsmål kjem her av seg sjølv.'),
    );
    expect(title()).toBe('Takk!');
  });

  it('a lost acknowledgement is sent again with the same bytes, never as a second answer', async () => {
    await start();
    view = open('L3', 'multi');
    await poll();
    await vi.waitFor(() => expect(title()).toBe('Brukar du tofaktor?'));
    answer = () => Promise.reject(new TypeError('network'));
    await act(() => root.querySelector<HTMLElement>('.opt[data-id="nei"]')!.click());
    await act(() => root.querySelector<HTMLButtonElement>('#send')!.click());
    await vi.waitFor(() => expect(root.textContent).toContain('Svaret kom ikkje fram.'));
    answer = () => json(201, { ok: true });
    await act(() => root.querySelector<HTMLButtonElement>('#send')!.click());
    await vi.waitFor(() => expect(title()).toBe('Takk!'));
    expect(posts).toHaveLength(2);
    expect(posts[1]!.body).toBe(posts[0]!.body);
    expect(JSON.parse(posts[0]!.body)).toMatchObject({ answers: { L3: ['nei'] } });
  });

  it('a closed question: refused by the server, or closed before the phone answered', async () => {
    await start();
    view = open();
    await poll();
    await vi.waitFor(() => expect(title()).toBe('Brukar du tofaktor?'));
    answer = () => json(409, { message: 'Spørsmålet er stengt.' });
    await act(() => root.querySelector<HTMLElement>('.opt[data-id="nei"]')!.click());
    await vi.waitFor(() => expect(title()).toBe('Spørsmålet er stengt'));
    expect(root.textContent).toContain('Du rakk ikkje å svare på dette.');
    // Another question opens and closes without an answer from this phone.
    view = open('L3');
    await poll();
    await vi.waitFor(() => expect(title()).toBe('Brukar du tofaktor?'));
    view = between;
    await poll();
    await vi.waitFor(() => expect(title()).toBe('Spørsmålet er stengt'));
    view = { state: 'done', languages: ['nn'], topic };
    await poll();
    expect(title()).toBe('Spørsmålet er stengt');
  });

  it('the end, and a link that no longer works', async () => {
    view = { state: 'done', languages: ['nn'], topic };
    await act(() => render(<LivePoll code={CODE} />, root));
    await vi.waitFor(() => expect(title()).toBe('Takk for at du var med!'));
    await act(() => render(null, root));
    vi.stubGlobal(
      'fetch',
      vi.fn(() => json(410, { message: 'Kartlegginga er avslutta.' })),
    );
    await act(() => render(<LivePoll code={CODE} />, root));
    await vi.waitFor(() => expect(title()).toBe('Kartlegginga er avslutta'));
  });
});

describe('screens', () => {
  it('follow the poll, the draft and what this phone missed', () => {
    const empty = { lang: null, items: {} };
    expect(liveScreen(null, empty, null, null)).toBe('loading');
    expect(liveScreen({ state: 'waiting', languages: ['nn'], topic }, empty, null, null)).toBe(
      'waiting',
    );
    expect(liveScreen(open(), empty, null, null)).toBe('question');
    expect(
      liveScreen(
        open(),
        { lang: null, items: { L2: { submission_id: 'x', confirmed: true } } },
        null,
        null,
      ),
    ).toBe('thanks');
    expect(liveScreen(between, empty, 'L2', null)).toBe('closed');
    expect(liveScreen(between, empty, null, 'L2')).toBe('thanks');
    expect(liveScreen(between, empty, null, null)).toBe('next');
  });
  it('the texts of the live poll are nynorsk', () => {
    for (const [k, v] of Object.entries(nn))
      if (k.startsWith('live')) expect(findBokmal(v), k).toEqual([]);
  });
});
