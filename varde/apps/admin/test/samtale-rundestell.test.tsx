// «Endre runda» (10.11): a name that can be corrected, and the end of a tour. A closed round leaves
// the chooser so the list stops growing, offers no new conversation, and opening it again undoes
// all of it. Nothing here deletes anything, and the panel has to say so.
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SamtalarPage } from '../src/samtalar-page.js';
import { button, mount, settle } from './support.js';

const counts = { planned: 1, in_progress: 0, done: 0, total: 1 };
const guide = { id: 'g1', label: 'v1', title: 'Kartlegging', question_count: 27 };
const round = (id: string, name: string, status: string) => ({
  id,
  name,
  status,
  created_at: '2026-11-10T08:00:00Z',
  guide: { id: guide.id, label: guide.label, title: guide.title },
  counts,
});
const interview = {
  id: 'iv1',
  client: { id: 'c1', name: 'Autohuset' },
  status: 'planned',
  held_on: null,
  interviewees: [],
  interviewers: [],
  done_at: null,
  updated_at: '2026-11-10T08:00:00Z',
  counts: { ivaretatt: 0, forbetring: 0, manglar: 0, ikkje_aktuelt: 0, none: 27 },
  score: null,
};

let rounds: ReturnType<typeof round>[];
let empty: boolean;
let sent: { url: string; method: string; body: unknown }[];
let asked: string[];
let view: ReturnType<typeof mount> | undefined;
const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  rounds = [round('r1', 'Kartkegging', 'open'), round('r2', 'Gamal runde', 'closed')];
  empty = false;
  sent = [];
  asked = [];
  window.history.pushState({}, '', '/admin/samtalar');
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') asked.push(url);
      if (method !== 'GET') {
        sent.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : null });
        if (url.endsWith('/name')) {
          const name = (JSON.parse(init!.body as string) as { name: string }).name;
          rounds = rounds.map((r) => (r.id === 'r1' ? { ...r, name } : r));
          return res({ name });
        }
        if (url.endsWith('/close')) {
          rounds = rounds.map((r) => (r.id === 'r1' ? { ...r, status: 'closed' } : r));
          return res({ status: 'closed' }, 201);
        }
        if (method === 'DELETE') {
          rounds = rounds.filter((r) => r.id !== 'r1');
          return res({ id: 'r1' });
        }
        if (url.endsWith('/reopen')) {
          rounds = rounds.map((r) => (r.id === 'r1' ? { ...r, status: 'open' } : r));
          return res({ status: 'open' }, 201);
        }
        return res({}, 201);
      }
      if (url === '/api/admin/interview-rounds') return res(rounds);
      if (url.startsWith('/api/admin/interview-rounds/')) {
        const id = url.split('/').pop()!;
        const r = rounds.find((x) => x.id === id)!;
        return res({ ...r, guide, interviews: empty ? [] : [interview] });
      }
      if (url === '/api/admin/interview-guides') return res([guide]);
      if (url === '/api/admin/clients') return res([{ id: 'c1', name: 'Autohuset', tags: [] }]);
      return res([]);
    }),
  );
});
afterEach(() => {
  view?.close();
  view = undefined;
  vi.unstubAllGlobals();
});

async function open() {
  view = mount(<SamtalarPage search="" />, true);
  await settle();
  return view.div;
}

it('keeps a closed round out of the chooser, and names the one round that is left', async () => {
  const div = await open();
  // One round is offered, so there is no chooser at all: the line above the clients carries the name.
  expect(div.querySelector('.seg')).toBeNull();
  expect(div.querySelector('.sm-guide')?.textContent).toContain('Kartkegging');
  expect(div.textContent).not.toContain('Gamal runde');
});

it('offers the way back to a closed round, so closing one is never a trap', async () => {
  const div = await open();
  expect(div.textContent).not.toContain('Gamal runde');
  act(() => button(div, 'Vis 1 avslutta').click());
  const seg = div.querySelector('.seg')?.textContent ?? '';
  expect(seg).toContain('Gamal runde (avslutta)');
  expect(seg).toContain('Kartkegging');
});

it('does not invite a closed and empty round to add clients it cannot take', async () => {
  rounds = [round('r1', 'Tom runde', 'closed')];
  empty = true;
  const div = await open();
  const text = div.textContent ?? '';
  expect(text).toContain('Ho er avslutta');
  expect(text).not.toContain('Legg dei til med knappen over');
});

it('still invites an open and empty round to add clients', async () => {
  rounds = [round('r1', 'Tom runde', 'open')];
  empty = true;
  const div = await open();
  expect(div.textContent).toContain('Legg dei til med knappen over');
});

it('shows a third, open round in the chooser beside the one in use', async () => {
  rounds = [...rounds, round('r3', 'Vår 2027', 'open')];
  const div = await open();
  const seg = div.querySelector('.seg')?.textContent ?? '';
  expect(seg).toContain('Kartkegging');
  expect(seg).toContain('Vår 2027');
  expect(seg).not.toContain('Gamal runde');
});

it('corrects the name of the round through «Endre runda»', async () => {
  const div = await open();
  act(() => button(div, 'Endre runda').click());
  const field = div.querySelector('input.input') as HTMLInputElement;
  expect(field.value).toBe('Kartkegging');
  act(() => {
    // React listens to the value setter, so a plain assignment would not reach it.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      field,
      'Kartlegging',
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => button(div, 'Lagre namnet').click());
  await settle();
  expect(sent).toEqual([
    { url: '/api/admin/interview-rounds/r1/name', method: 'PUT', body: { name: 'Kartlegging' } },
  ]);
});

it('closes the round, stops new conversations and opens it again', async () => {
  const div = await open();
  expect(button(div, 'Start samtale').disabled).toBe(false);

  act(() => button(div, 'Endre runda').click());
  expect(div.textContent).toContain('Runda blir ikkje sletta');
  act(() => button(div, 'Avslutt runda').click());
  await settle();
  expect(sent.at(-1)).toMatchObject({
    url: '/api/admin/interview-rounds/r1/close',
    method: 'POST',
  });

  // The round that was closed stays on the screen, and says what it is now.
  expect(div.querySelector('.sm-guide')?.textContent).toContain('Avslutta');
  expect(button(div, 'Start samtale').disabled).toBe(true);
  expect([...div.querySelectorAll('button')].some((b) => b.textContent === 'Legg til kundar')).toBe(
    false,
  );

  act(() => button(div, 'Endre runda').click());
  act(() => button(div, 'Opne runda att').click());
  await settle();
  expect(sent.at(-1)).toMatchObject({
    url: '/api/admin/interview-rounds/r1/reopen',
    method: 'POST',
  });
  expect(button(div, 'Start samtale').disabled).toBe(false);
});

it('offers to delete a round nobody has sat down in, and says so when it cannot', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const div = await open();
  act(() => button(div, 'Endre runda').click());
  expect(div.textContent).toContain('Ingen har sett seg ned i henne enno');
  // «Slett runda» is a hold button: a click is not enough, the press has to last.
  const hold = button(div, 'Slett runda');
  asked.length = 0;
  act(() => {
    hold.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  });
  await act(async () => {
    vi.advanceTimersByTime(1300);
    await Promise.resolve();
  });
  await settle();
  expect(sent.at(-1)).toMatchObject({ url: '/api/admin/interview-rounds/r1', method: 'DELETE' });
  // Nothing asks the server for the round that is gone on the way back to the plain page.
  await settle();
  expect(asked).not.toContain('/api/admin/interview-rounds/r1');
  vi.useRealTimers();
});

it('refuses the press and names the way out when a conversation is going', async () => {
  rounds = [{ ...round('r1', 'Brukt', 'open'), counts: { ...counts, planned: 0, in_progress: 1 } }];
  const div = await open();
  act(() => button(div, 'Endre runda').click());
  expect(div.textContent).toContain('Her er det alt samtalar');
  expect(div.textContent).toContain('Personvern → Sletting');
  expect([...div.querySelectorAll('button')].some((b) => b.textContent === 'Slett runda')).toBe(
    false,
  );
});
