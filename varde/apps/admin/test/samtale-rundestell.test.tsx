// The rounds of «Samtalar» (10.11, variant B): a list of rounds, open first, and one round as a page with
// «Kundar» (find a client by name, filter by state, the one thing to do next, a bin per conversation) and
// «Innstillingar» (a name that can be corrected, the end of a tour, and the deletion of the round).
// Closing deletes nothing, opening it again undoes it, and the page has to say so.
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SamtalarPage } from '../src/samtalar-page.js';
import { SamtaleRundePage } from '../src/samtale-runde-page.js';
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
const none = { ivaretatt: 0, forbetring: 0, manglar: 0, ikkje_aktuelt: 0, none: 27 };
const interview = (id: string, name: string, status: string) => ({
  id,
  client: { id: `c-${id}`, name },
  status,
  held_on: status === 'planned' ? null : '2026-11-10',
  interviewees: status === 'planned' ? [] : [{ role: 'dagleg leiar', name: 'Kari' }],
  interviewers: [],
  done_at: status === 'done' ? '2026-11-10T10:00:00Z' : null,
  updated_at: '2026-11-10T08:00:00Z',
  counts:
    status === 'planned' ? none : { ...none, ivaretatt: 9, forbetring: 9, manglar: 9, none: 0 },
  score: status === 'done' ? 50 : null,
});

let rounds: ReturnType<typeof round>[];
let interviews: ReturnType<typeof interview>[];
let sent: { url: string; method: string; body: unknown }[];
let asked: string[];
let view: ReturnType<typeof mount> | undefined;
const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  rounds = [round('r1', 'Kartkegging', 'open'), round('r2', 'Gamal runde', 'closed')];
  interviews = [interview('iv1', 'Autohuset', 'planned')];
  sent = [];
  asked = [];
  window.history.pushState({}, '', '/admin/samtalar/runde/r1');
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
        return res({ ...r, guide, interviews });
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

async function page(tab?: string) {
  view = mount(<SamtaleRundePage id="r1" tab={tab} search="" />, true);
  await settle();
  return view.div;
}
const typeInto = (field: HTMLInputElement, text: string) =>
  act(() => {
    // React listens to the value setter, so a plain assignment would not reach it.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
const names = (div: HTMLElement) =>
  [...div.querySelectorAll('.sm-rundliste .sm-rundnamn b')].map((b) => b.textContent);
const search = (div: HTMLElement) => div.querySelector('input[type="search"]') as HTMLInputElement;

it('lists the open rounds before the closed ones, each a link to its own page', async () => {
  view = mount(<SamtalarPage />, true);
  await settle();
  const groups = [...view.div.querySelectorAll('section.rad-liste')];
  expect(groups.map((g) => g.querySelector('h2')?.textContent)).toEqual(['Opne', 'Avslutta']);
  expect(groups[0]!.textContent).toContain('Kartkegging');
  expect(groups[0]!.textContent).toContain('0 av 1 fullførte');
  expect(groups[1]!.textContent).toContain('Gamal runde');
  expect(groups[0]!.querySelector('a')?.getAttribute('href')).toBe('/admin/samtalar/runde/r1');
});

it('heads the page with the round, not with a chooser', async () => {
  const div = await page();
  expect(div.querySelector('h1')?.textContent).toBe('Kartkegging');
  expect(div.querySelector('.sidetittel p')?.textContent).toContain('27 spørsmål');
  const tabs = [...div.querySelectorAll('nav[aria-label="Samtalerunda"] a')];
  expect(tabs.map((a) => a.textContent)).toEqual(['Kundar', 'Oversikt', 'Innstillingar']);
  expect(tabs[0]!.getAttribute('aria-current')).toBe('page');
});

it('finds a client by name and filters by state, going on first', async () => {
  interviews = [
    interview('iv1', 'Vestre Bygg', 'planned'),
    interview('iv2', 'Søre Tre', 'done'),
    interview('iv3', 'Austre Hotell', 'planned'),
    interview('iv4', 'Nordre Maskin', 'in_progress'),
  ];
  const div = await page();
  expect(names(div)).toEqual(['Nordre Maskin', 'Austre Hotell', 'Vestre Bygg', 'Søre Tre']);
  typeInto(search(div), 'aus');
  expect(names(div)).toEqual(['Austre Hotell']);
  typeInto(search(div), 'xyz');
  expect(div.textContent).toContain('Ingen kundar i runda passar til «xyz».');
  typeInto(search(div), '');
  act(() => button(div, 'Fullførte 1').click());
  expect(names(div)).toEqual(['Søre Tre']);
});

it('opens a finished conversation on its summary and one going on at its questions', async () => {
  interviews = [interview('iv2', 'Søre Tre', 'done'), interview('iv4', 'Nordre', 'in_progress')];
  const div = await page();
  const links = [...div.querySelectorAll('.sm-kunderad-gjer a')];
  expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
    ['Hald fram', '/admin/samtalar/iv4'],
    ['Opne', '/admin/samtalar/iv2/oppsummering'],
  ]);
});

it('invites an open and empty round to add clients, and not a closed one', async () => {
  interviews = [];
  let div = await page();
  expect(div.textContent).toContain('Legg til kundane de skal snakke med.');
  view!.close();
  rounds = [round('r1', 'Tom runde', 'closed')];
  div = await page();
  expect(div.textContent).toContain('Runda er avslutta, så du kan ikkje leggje til fleire.');
  expect([...div.querySelectorAll('button')].some((b) => b.textContent === 'Legg til kundar')).toBe(
    false,
  );
});

it('corrects the name of the round under «Innstillingar»', async () => {
  const div = await page('innstillingar');
  const field = div.querySelector('input.input') as HTMLInputElement;
  expect(field.value).toBe('Kartkegging');
  typeInto(field, 'Kartlegging');
  act(() => button(div, 'Lagre namnet').click());
  await settle();
  expect(sent).toEqual([
    { url: '/api/admin/interview-rounds/r1/name', method: 'PUT', body: { name: 'Kartlegging' } },
  ]);
  expect(div.textContent).toContain('Namnet er lagra.');
});

it('closes the round, stops new conversations and opens it again', async () => {
  let div = await page();
  expect(button(div, 'Start samtale').disabled).toBe(false);
  view!.close();

  div = await page('innstillingar');
  expect(div.textContent).toContain('Runda blir ikkje sletta');
  act(() => button(div, 'Avslutt runda').click());
  await settle();
  expect(sent.at(-1)).toMatchObject({
    url: '/api/admin/interview-rounds/r1/close',
    method: 'POST',
  });
  expect(div.querySelector('.sidetittel .chip')?.textContent).toBe('Avslutta');
  view!.close();

  // The round that was closed says what it is now, and offers no new conversation.
  div = await page();
  expect(div.textContent).toContain('Runda er avslutta.');
  expect(button(div, 'Start samtale').disabled).toBe(true);
  expect([...div.querySelectorAll('button')].some((b) => b.textContent === 'Legg til kundar')).toBe(
    false,
  );
  view!.close();

  div = await page('innstillingar');
  act(() => button(div, 'Opne runda att').click());
  await settle();
  expect(sent.at(-1)).toMatchObject({
    url: '/api/admin/interview-rounds/r1/reopen',
    method: 'POST',
  });
  view!.close();
  div = await page();
  expect(button(div, 'Start samtale').disabled).toBe(false);
});

it('offers to delete a round nobody has sat down in, and says so when it cannot', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const div = await page('innstillingar');
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
  expect(window.location.pathname).toBe('/admin/samtalar');
  // Nothing asks the server for the round that is gone on the way back to the list.
  await settle();
  expect(asked).not.toContain('/api/admin/interview-rounds/r1');
  vi.useRealTimers();
});

it('deletes a round with written conversations too, by a held press that says what goes', async () => {
  rounds = [
    {
      ...round('r1', 'Brukt', 'open'),
      counts: { planned: 1, in_progress: 1, done: 2, total: 4 },
    },
  ];
  const div = await page('innstillingar');
  expect(div.textContent).toContain('alle dei 4 samtalane i henne blir sletta for godt');
  expect(div.textContent).toContain('2 fullførte og 1 i gang');
  expect(div.textContent).toContain('avslutt runda i staden');
  expect(div.textContent).not.toContain('Personvern');
  expect(button(div, 'Slett runda')).toBeTruthy();
});

it('deletes a planned conversation from its row after one question', async () => {
  interviews = [interview('iv1', 'Vestre Bygg', 'planned'), interview('iv2', 'Søre Tre', 'done')];
  const div = await page();
  const bin = div.querySelector(
    'button[aria-label="Slett samtalen med Vestre Bygg"]',
  ) as HTMLButtonElement;
  act(() => bin.click());
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain('Slett samtalen med Vestre Bygg?');
  expect(dialog.textContent).toContain('ingenting skrive');
  act(() => button(dialog as HTMLElement, 'Slett samtalen').click());
  await settle();
  expect(sent.at(-1)).toMatchObject({ url: '/api/admin/interviews/iv1', method: 'DELETE' });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('asks for a held press before a written conversation goes', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  interviews = [interview('iv2', 'Søre Tre', 'done')];
  const div = await page();
  act(() =>
    (
      div.querySelector('button[aria-label="Slett samtalen med Søre Tre"]') as HTMLButtonElement
    ).click(),
  );
  const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
  expect(dialog.textContent).toContain('Samtalen er fullført.');
  expect(dialog.textContent).toContain('Det kan ikkje angrast.');
  const hold = button(dialog, 'Slett samtalen');
  // A click is not enough.
  act(() => hold.click());
  await settle();
  expect(sent).toEqual([]);
  act(() => {
    hold.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  });
  await act(async () => {
    vi.advanceTimersByTime(1300);
    await Promise.resolve();
  });
  await settle();
  expect(sent.at(-1)).toMatchObject({ url: '/api/admin/interviews/iv2', method: 'DELETE' });
  vi.useRealTimers();
});
