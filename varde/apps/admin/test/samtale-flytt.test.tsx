// A conversation moved to another client, on its own page (the concept, «ошиблись клиентом»): the last
// client's «Førre gong» and employees' numbers never stand under the new name, and a screen behind a
// move can neither show the new client's numbers under the old name nor move the conversation back.
import { QueryClient } from '@tanstack/react-query';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEvents } from '../src/events.js';
import { SamtalePage } from '../src/samtale-page.js';
import { button, mount, settle } from './support.js';

const A = { id: 'c-a', name: 'Kunde Aaa' };
const B = { id: 'c-b', name: 'Kunde Bbb' };
type Client = typeof A;
const q = (id: string) => ({
  id,
  section: 'S',
  short: `Kort ${id}`,
  text: `Tekst ${id}`,
  help: null,
  criteria: null,
});
const counts = { ivaretatt: 0, forbetring: 0, manglar: 0, ikkje_aktuelt: 0, none: 2 };
const interview = (client: Client, said: string) => ({
  id: 'iv1',
  status: 'in_progress',
  held_on: '2026-11-10',
  interviewees: [{ role: 'leiar' }],
  interviewers: [],
  summary: '',
  agreed: '',
  note: '',
  started_at: '2026-11-10T10:00:00Z',
  done_at: null,
  done_by: null,
  client,
  round: { id: 'r1', name: 'R' },
  guide: { title: 'G', label: 'v1', questions: [q('N2'), q('N3')] },
  answers: {},
  previous: {
    id: 'old',
    held_on: '2026-01-01',
    round: { id: 'r0', name: 'R0' },
    counts,
    score: null,
    answers: {
      N2: { rating: 'manglar', answer: said, action: '' },
      N3: { rating: 'manglar', answer: said, action: '' },
    },
  },
});
const employees = (client: Client, label: string) => ({
  class: 'aggregate',
  client: client.id,
  round: { id: 'x', name: 'Runde', closed_on: '2026-10-31', after_conversation: false },
  questions: ['N2', 'N3'].map((question) => ({
    question,
    employees: [
      {
        id: 'F1',
        label,
        text: 't',
        multi: false,
        suppressed: false,
        n: 5,
        options: [{ id: 'ja', label: 'Ja', count: 5 }],
      },
    ],
  })),
});
const row = (id: string, client: Client, status: string) => ({
  id,
  client,
  status,
  held_on: null,
  interviewees: [],
  interviewers: [],
  done_at: null,
  updated_at: '2026-11-10T10:00:00Z',
  counts,
  score: null,
});

/** What the server holds: whose conversation it is and what that client's history says. */
const A_SIDE = { client: A, said: 'A-TEKST', numbers: 'NUMS-A' };
const B_SIDE = { client: B, said: 'B-TEKST', numbers: 'NUMS-B' };
let side = A_SIDE;
let hold: Promise<void> | null = null;
let refuse = false;
let failInterview = false;
let posts: { client?: string; from?: string }[] = [];
let reads: string[] = [];
const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  side = A_SIDE;
  hold = null;
  refuse = false;
  failInterview = false;
  posts = [];
  reads = [];
  window.history.pushState({}, '', '/admin/samtalar/iv1?q=N2');
  Element.prototype.scrollIntoView = () => undefined; // not in jsdom
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.endsWith('/start')) {
        posts.push(JSON.parse(init.body as string) as { client?: string });
        if (refuse) return res({ message: 'Denne kunden har alt ein samtale i runda.' }, 409);
        side = B_SIDE;
        return res({ id: 'iv1' }, 201);
      }
      reads.push(url);
      if (url.endsWith('/employees')) {
        if (hold) await hold;
        return res(employees(side.client, side.numbers));
      }
      if (url === '/api/admin/interviews/iv1') {
        if (hold) await hold;
        if (failInterview) return res({ message: 'Noko gjekk gale.' }, 500);
        return res(interview(side.client, side.said));
      }
      if (url.startsWith('/api/admin/interview-rounds/'))
        return res({
          id: 'r1',
          name: 'R',
          status: 'open',
          guide: { id: 'g', label: 'v1', title: 'G', question_count: 2 },
          interviews: [
            row('iv1', side.client, 'in_progress'),
            row('p', side.client === A ? B : A, 'planned'),
          ],
        });
      return res([]);
    }),
  );
});
let view: ReturnType<typeof mount> | undefined;
afterEach(() => {
  view?.close();
  view = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.pushState({}, '', '/');
});

const text = () => view!.div.textContent ?? '';
async function open() {
  view = mount(<SamtalePage id="iv1" search="?q=N2" />, true);
  await settle();
  await settle();
  expect(text()).toContain('Kunde Aaa');
  expect(text()).toContain('NUMS-A');
  expect(text()).toContain('A-TEKST');
}
const dialog = () => document.querySelector<HTMLDivElement>('[role="dialog"]')!;
const kunde = () => dialog().querySelector<HTMLSelectElement>('select[aria-label="Kunde"]')!;
async function endre() {
  act(() =>
    view!.div
      .querySelector<HTMLButtonElement>('[aria-label="Endre kven som er med og dato"]')!
      .click(),
  );
  await settle();
}
function choose(value: string) {
  act(() => {
    const el = kunde();
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function lagre() {
  await act(async () => {
    button(dialog(), 'Lagre').click();
    await Promise.resolve();
  });
}

it('the screen that moves it: the last client is gone at once, then the new one comes', async () => {
  await open();
  let release!: () => void;
  hold = new Promise<void>((r) => (release = r));
  await endre();
  choose('c-b');
  await lagre();
  await settle();
  // The answers on the way: the new name, and nothing of the last client's under it.
  expect(text()).toContain('Kunde Bbb');
  expect(text()).not.toContain('NUMS-A');
  expect(text()).not.toContain('A-TEKST');
  expect(posts[0]).toMatchObject({ client: 'c-b', from: 'c-a' });
  release();
  hold = null;
  await settle();
  await settle();
  expect(text()).toContain('NUMS-B');
  expect(text()).toContain('B-TEKST');
  expect(dialog()).toBeNull();
});

it('when the new client’s history cannot be read, the last client’s does not stay', async () => {
  await open();
  await endre();
  failInterview = true;
  choose('c-b');
  await lagre();
  await settle();
  await settle();
  expect(text()).toContain('Kunde Bbb');
  expect(text()).not.toContain('A-TEKST');
});

it('a screen behind a move never shows the new client’s numbers under the old name', async () => {
  await open();
  side = B_SIDE; // moved on another screen; this one has not heard
  const real = Date.now;
  vi.spyOn(Date, 'now').mockImplementation(() => real() + 6 * 60_000);
  const next = [...view!.div.querySelectorAll('button')].find((b) =>
    b.getAttribute('aria-label')?.startsWith('Spørsmål 2'),
  )!;
  await act(async () => {
    next.click();
    await Promise.resolve();
  });
  await settle();
  await settle();
  expect(reads.filter((u) => u.endsWith('/employees')).length).toBeGreaterThan(1);
  expect(text()).toContain('Kunde Aaa');
  expect(text()).not.toContain('NUMS-B');
});

it('a screen behind a move cannot move it back by correcting the day', async () => {
  await open();
  side = B_SIDE; // moved elsewhere: the round now says A is free, the header still says A
  await endre();
  await settle();
  // A is free in the fresh list of the round, but it is the client on this screen: nothing to choose.
  expect(kunde()).toBeNull();
  await lagre();
  await settle();
  expect(posts[0]).not.toHaveProperty('client');
  expect(posts[0]).not.toHaveProperty('from');
});

it('reads who is free when the dialog opens, and again when the server says no', async () => {
  await open();
  const rounds = () => reads.filter((u) => u.startsWith('/api/admin/interview-rounds/')).length;
  const before = rounds();
  await endre();
  expect(rounds()).toBeGreaterThan(before);
  const opened = rounds();
  refuse = true;
  choose('c-b');
  await lagre();
  await settle();
  expect(dialog().textContent).toContain('Denne kunden har alt ein samtale i runda.');
  expect(rounds()).toBeGreaterThan(opened);
});

it('the other screens hear of a move on the stream, under the key of Samtalar', () => {
  const listeners = new Map<string, (e: MessageEvent<string>) => void>();
  class Stream {
    addEventListener(name: string, fn: (e: MessageEvent<string>) => void) {
      listeners.set(name, fn);
    }
    removeEventListener() {}
    close() {}
  }
  vi.stubGlobal('EventSource', Stream);
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  function Shell() {
    useEvents(client);
    return null;
  }
  view = mount(<Shell />);
  act(() =>
    listeners.get('changed')!({
      data: JSON.stringify({ topic: 'samtalar' }),
    } as MessageEvent<string>),
  );
  const asked = invalidate.mock.calls[0]![0] as unknown as {
    queryKey: string[];
    predicate: (q: { queryKey: unknown[] }) => boolean;
  };
  expect(asked.queryKey).toEqual(['samtalar']);
  expect(asked.predicate({ queryKey: ['samtalar', 'interview', 'iv1'] })).toBe(true);
  // A referat is read once per visit, since each read is written to AuditLog.
  expect(asked.predicate({ queryKey: ['samtalar', 'referat', 'iv1'] })).toBe(false);
});
