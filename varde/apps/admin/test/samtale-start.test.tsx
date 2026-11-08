// The start of a conversation (2.20) as in the concept: a dialog in the middle of the screen with the
// guide, the people from the client (a role, a name if they want), names from Vardahei to tick and the
// day. «Avbryt», Escape and the veil close it, but not while it sends, not an Escape another layer used
// and not a press on the veil's scrollbar; «Endre» corrects the same fields. What reaches the API is
// exactly what was chosen, and a name typed without «Legg til» is not lost.
import { afterEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { clock, longDate, today as todayOf } from '../src/samtale-models.js';
import { StartSamtale, type StartRow, unique } from '../src/samtale-start.js';
import { button, mount, settle } from './support.js';

const row: StartRow = {
  id: 'iv1',
  client: { id: 'c1', name: 'Rekneskap 01' },
  held_on: null,
  interviewees: [],
  interviewers: [],
};
const guide = { title: 'Kartlegging nøkkelpersonar', label: 'v1', question_count: 27 };
let view: ReturnType<typeof mount> | undefined;
afterEach(() => {
  view?.close();
  view = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function input(el: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const key = (el: EventTarget, name: string, used = false) => {
  const e = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
  if (used) e.preventDefault();
  act(() => {
    el.dispatchEvent(e);
  });
};
const field = (label: string) =>
  view!.div.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
const day = () => view!.div.querySelector<HTMLInputElement>('input[type="date"]')!;
const boxes = () =>
  [...view!.div.querySelectorAll<HTMLLabelElement>('.sm-vi-namn')].map((l) => [
    l.textContent,
    l.querySelector('input')!.checked,
  ]);
function server(hold = false) {
  const sent: { url: string; body: unknown }[] = [];
  let release: () => void = () => undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      sent.push({ url, body: JSON.parse(init!.body as string) as unknown });
      const answer = () => new Response(JSON.stringify({ id: 'iv1' }), { status: 201 });
      if (!hold) return Promise.resolve(answer());
      return new Promise<Response>((done) => {
        release = () => done(answer());
      });
    }),
  );
  return { sent, release: () => release() };
}

it('opens in the middle with the guide, a «dagleg leiar», the one signed in ticked and today', () => {
  view = mount(
    <StartSamtale
      row={row}
      guide={guide}
      names={['Oleksandr', 'Asbjørn', ' oleksandr ']}
      me="Asbjørn"
      onClose={() => undefined}
      onDone={() => undefined}
    />,
  );
  const dialog = view.div.querySelector('[role="dialog"]')!;
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(dialog.closest('.sm-dlg-slor')).not.toBeNull();
  expect(dialog.querySelector('h2')!.textContent).toBe('Start samtale med Rekneskap 01');
  expect(view.div.querySelector('.sm-dlg-guide')!.textContent).toBe(
    'Kartlegging nøkkelpersonar · v1 · 27 spørsmål',
  );
  expect(field('Rolle').value).toBe('dagleg leiar');
  expect(field('Namn (valfritt)').placeholder).toBe('Namn (valfritt)');
  expect(document.activeElement).toBe(field('Rolle'));
  // The one signed in first and ticked; the others once each, whatever the case.
  expect(boxes()).toEqual([
    ['Asbjørn', true],
    ['Oleksandr', false],
  ]);
  expect(day().value).toBe(todayOf());
  expect(button(view.div, 'Avbryt').type).toBe('button');
});

it('sends the people, the ticked names and a name typed but not yet added', async () => {
  const { sent } = server();
  const done = vi.fn();
  view = mount(
    <StartSamtale
      row={row}
      guide={guide}
      names={['Oleksandr', 'Bjarte']}
      me="Asbjørn"
      onClose={() => undefined}
      onDone={done}
    />,
  );
  input(field('Namn (valfritt)'), 'Kari Nordmann');
  act(() => button(view!.div, 'Legg til person').click());
  expect(document.activeElement).toBe(field('Rolle, person 2'));
  input(field('Rolle, person 2'), ' økonomi ');
  act(() => view!.div.querySelectorAll<HTMLInputElement>('.sm-vi-namn input')[2]!.click());
  act(() => button(view!.div, 'Legg til namn').click());
  input(field('Namn frå Vardahei'), 'Silje');
  key(field('Namn frå Vardahei'), 'Enter');
  // Enter adds a ticked box and leaves the focus in the field for the next name.
  expect(boxes()).toEqual([
    ['Asbjørn', true],
    ['Bjarte', false],
    ['Oleksandr', true],
    ['Silje', true],
  ]);
  expect(document.activeElement).toBe(field('Namn frå Vardahei'));
  // Typed, not added, then «Start samtalen»: it still goes, in the spelling already offered.
  input(field('Namn frå Vardahei'), 'bjarte');
  act(() => button(view!.div, 'Start samtalen').click());
  await settle();
  const body = {
    held_on: todayOf(),
    interviewees: [{ role: 'dagleg leiar', name: 'Kari Nordmann' }, { role: 'økonomi' }],
    interviewers: ['Asbjørn', 'Oleksandr', 'Silje', 'Bjarte'],
  };
  expect(sent).toEqual([{ url: '/api/admin/interviews/iv1/start', body }]);
  expect(done).toHaveBeenCalledWith(body);
});

it('will not start while a name has no role or the day is empty, and says why', () => {
  const { sent } = server();
  view = mount(
    <StartSamtale
      row={row}
      guide={null}
      names={[]}
      me={null}
      onClose={() => undefined}
      onDone={() => undefined}
    />,
  );
  // No names from Vardahei yet: the field for one is open at once.
  expect(field('Namn frå Vardahei')).not.toBeNull();
  act(() => button(view!.div, 'Legg til person').click());
  input(field('Namn, person 2 (valfritt)'), 'Per');
  const why = view.div.querySelector('.sm-dlg-feil')!;
  expect(why.textContent).toBe('Skriv rolla til alle som er med.');
  expect(why.getAttribute('role')).toBe('alert');
  expect(field('Rolle, person 2').getAttribute('aria-invalid')).toBe('true');
  expect(field('Rolle, person 2').getAttribute('aria-describedby')).toBe(why.id);
  expect(button(view.div, 'Start samtalen').disabled).toBe(true);
  // «Fjern» takes the person away and gives the focus to the one above.
  act(() => view!.div.querySelector<HTMLButtonElement>('[aria-label="Fjern person 2"]')!.click());
  expect(document.activeElement).toBe(field('Rolle'));
  expect(button(view.div, 'Start samtalen').disabled).toBe(false);
  input(day(), '');
  expect(button(view.div, 'Start samtalen').disabled).toBe(true);
  expect(day().getAttribute('aria-describedby')).toBe(
    view.div.querySelector('.sm-dato .sm-dlg-feil')!.id,
  );
  expect(sent).toEqual([]);
});

it('takes six names from Vardahei and says so instead of dropping the seventh', () => {
  view = mount(
    <StartSamtale
      row={row}
      guide={null}
      names={['A1', 'A2', 'A3', 'A4', 'A5', 'A6']}
      me="A0"
      onClose={() => undefined}
      onDone={() => undefined}
    />,
  );
  const tick = (n: number) =>
    act(() => view!.div.querySelectorAll<HTMLInputElement>('.sm-vi-namn input')[n]!.click());
  for (const n of [1, 2, 3, 4]) tick(n);
  act(() => button(view!.div, 'Legg til namn').click());
  input(field('Namn frå Vardahei'), 'a5');
  key(field('Namn frå Vardahei'), 'Enter');
  // The sixth came from the field in the offered spelling; the field gives way to the hint.
  expect(boxes().filter(([, on]) => on)).toHaveLength(6);
  expect(boxes()).toContainEqual(['A5', true]);
  expect(view.div.querySelector('input[aria-label="Namn frå Vardahei"]')).toBeNull();
  expect(view.div.querySelector('.sm-dlg-hint')!.textContent).toContain('Høgst seks');
  expect(document.activeElement).toBe(view.div.querySelectorAll('.sm-vi-namn input')[5]);
  expect(view.div.querySelectorAll<HTMLInputElement>('.sm-vi-namn input')[6]!.disabled).toBe(true);
});

it('«Endre» opens with what was saved, says «Lagre» and ticks no one who was not saved', () => {
  view = mount(
    <StartSamtale
      edit
      row={{
        ...row,
        held_on: '2026-11-10',
        interviewees: [{ role: 'dagleg leiar', name: 'Kari Nordmann' }, { role: 'økonomi' }],
        interviewers: [],
      }}
      guide={guide}
      names={['Oleksandr']}
      me="Asbjørn"
      onClose={() => undefined}
      onDone={() => undefined}
    />,
  );
  expect(view.div.querySelector('h2')!.textContent).toBe('Endre samtalen med Rekneskap 01');
  expect(field('Namn (valfritt)').value).toBe('Kari Nordmann');
  expect(field('Rolle, person 2').value).toBe('økonomi');
  expect(boxes()).toEqual([
    ['Asbjørn', false],
    ['Oleksandr', false],
  ]);
  expect(day().value).toBe('2026-11-10');
  expect(button(view.div, 'Lagre').disabled).toBe(false);
});

it('closes on Escape, the veil and «Avbryt», but not on an Escape used elsewhere or the scrollbar', () => {
  const close = vi.fn();
  view = mount(
    <StartSamtale
      row={row}
      guide={guide}
      names={['Oleksandr']}
      me="Asbjørn"
      onClose={close}
      onDone={() => undefined}
    />,
  );
  // An Escape the ⌘K palette has used is not ours.
  key(window, 'Escape', true);
  // A first Escape in «Namn frå Vardahei» empties the field; the next one closes.
  act(() => button(view!.div, 'Legg til namn').click());
  input(field('Namn frå Vardahei'), 'Silje');
  key(field('Namn frå Vardahei'), 'Escape');
  expect(field('Namn frå Vardahei').value).toBe('');
  expect(close).not.toHaveBeenCalled();
  key(field('Namn frå Vardahei'), 'Escape');
  expect(close).toHaveBeenCalledTimes(1);
  // The veil: a press on it closes, on its scrollbar (past clientWidth) or inside the dialog not.
  const veil = view.div.querySelector<HTMLElement>('.sm-dlg-slor')!;
  Object.defineProperty(veil, 'clientWidth', { value: 985 });
  const press = (target: Element, clientX: number) =>
    act(() => {
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX }));
    });
  press(veil, 997);
  press(view.div.querySelector('h2')!, 500);
  expect(close).toHaveBeenCalledTimes(1);
  press(veil, 500);
  expect(close).toHaveBeenCalledTimes(2);
  act(() => button(view!.div, 'Avbryt').click());
  expect(close).toHaveBeenCalledTimes(3);
});

it('stays open while it sends: no Escape, no veil, no «Avbryt»', async () => {
  const { sent, release } = server(true);
  const close = vi.fn();
  const done = vi.fn();
  view = mount(
    <StartSamtale row={row} guide={guide} names={[]} me="Asbjørn" onClose={close} onDone={done} />,
  );
  act(() => button(view!.div, 'Start samtalen').click());
  expect(sent).toHaveLength(1);
  expect(button(view.div, 'Avbryt').disabled).toBe(true);
  key(window, 'Escape');
  act(() => {
    view!.div
      .querySelector('.sm-dlg-slor')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  // A second press of «Start samtalen» sends nothing more.
  act(() => button(view!.div, 'Start samtalen').click());
  expect(sent).toHaveLength(1);
  expect(close).not.toHaveBeenCalled();
  release();
  await settle();
  expect(done).toHaveBeenCalledTimes(1);
});

it('writes days and times in Nynorsk on the 24-hour clock, whatever the browser carries', () => {
  // A browser without Nynorsk answers in English: the helpers must not ask it.
  vi.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('09:53 PM');
  vi.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('November 10, 2026');
  vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('11/10/2026, 9:53:00 PM');
  const year = new Date().getFullYear();
  expect(longDate(`${year}-11-25`)).toBe('25. november');
  expect(longDate('2025-05-04')).toBe('4. mai 2025');
  expect(longDate(null)).toBe('');
  expect(clock(new Date(2026, 10, 6, 21, 53))).toBe('21:53');
  expect(clock(new Date(2026, 10, 6, 9, 5))).toBe('09:05');
});

it('takes today in the browser’s own time zone, not in UTC', () => {
  const zone = process.env.TZ;
  process.env.TZ = 'Europe/Oslo';
  try {
    // 00:30 in Oslo is still the day before in UTC.
    const night = new Date(2026, 0, 5, 0, 30);
    expect(night.toISOString().slice(0, 10)).toBe('2026-01-04');
    expect(todayOf(night)).toBe('2026-01-05');
  } finally {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  }
});

it('keeps each name once, whatever its case and spaces', () => {
  expect(unique([' Asbjørn', 'asbjørn', '', 'Oleksandr ', 'ASBJØRN'])).toEqual([
    'Asbjørn',
    'Oleksandr',
  ]);
});

// The concept, «ошиблись клиентом»: «Endre» moves a conversation started with the wrong client.
const others = [
  { id: 'c3', name: 'Tannlege 10' },
  { id: 'c2', name: 'Bakeri 22' },
];
const kunde = () => view!.div.querySelector<HTMLSelectElement>('select[aria-label="Kunde"]');
const choose = (el: HTMLSelectElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
const started: StartRow = {
  ...row,
  held_on: '2026-11-10',
  interviewees: [{ role: 'dagleg leiar' }],
  interviewers: ['Asbjørn'],
};
const open = (clients: { id: string; name: string }[], edit: boolean, done = vi.fn()) => {
  view = mount(
    <StartSamtale
      edit={edit}
      row={started}
      guide={guide}
      names={[]}
      clients={clients}
      me={null}
      onClose={() => undefined}
      onDone={done}
    />,
  );
  return done;
};

it('offers the clients of the round not started only in «Endre», the one it has first, then by name', () => {
  open(others, false);
  expect(kunde()).toBeNull();
  view!.close();
  open([], true);
  expect(kunde()).toBeNull();
  view!.close();
  open(others, true);
  expect([...kunde()!.options].map((o) => o.text)).toEqual([
    'Rekneskap 01',
    'Bakeri 22',
    'Tannlege 10',
  ]);
  expect(kunde()!.value).toBe('c1');
  // The name of the field is the label alone, and the hint says what it is for.
  const hint = document.getElementById(kunde()!.getAttribute('aria-describedby')!)!;
  expect(hint.textContent).toBe(
    'Starta med feil kunde? Vel den rette her. Berre kundar i runda som ikkje har starta, kan veljast.',
  );
});

it('says what a move does before it is saved, and sends no client when none was chosen', async () => {
  const { sent } = server();
  const done = open(others, true);
  await act(async () => {
    button(view!.div, 'Lagre').click();
    await Promise.resolve();
  });
  await settle();
  expect(sent[0]!.body).not.toHaveProperty('client');
  expect(done.mock.calls[0]![0]).not.toHaveProperty('client');
  view!.close();

  const moved = server();
  const after = open(others, true);
  choose(kunde()!, 'c2');
  expect(view!.div.querySelector('[role="status"]')!.textContent).toBe(
    'Samtalen og alt som er skrive, blir flytta til Bakeri 22. Rekneskap 01 står att som ikkje starta.',
  );
  // Changing one's mind: back to the words of the hint, and no move.
  choose(kunde()!, 'c1');
  expect(view!.div.querySelector('[role="status"]')!.textContent).toMatch(/^Starta med feil kunde/);
  choose(kunde()!, 'c2');
  await act(async () => {
    button(view!.div, 'Lagre').click();
    await Promise.resolve();
  });
  await settle();
  expect(moved.sent[0]).toMatchObject({
    url: '/api/admin/interviews/iv1/start',
    // With the client this screen showed, so a move made on a stale screen is refused.
    body: { client: 'c2', from: 'c1', held_on: '2026-11-10' },
  });
  expect(after.mock.calls[0]![0]).toMatchObject({ client: 'c2' });
});

it('never offers the client it has, even when a fresh list of the round says that one is free', async () => {
  // A screen behind a move: the header still says c1, while the round says c1 is not started.
  const { sent } = server();
  open([{ id: 'c1', name: 'Rekneskap 01' }, ...others], true);
  expect([...kunde()!.options].map((o) => o.text)).toEqual([
    'Rekneskap 01',
    'Bakeri 22',
    'Tannlege 10',
  ]);
  expect(kunde()!.value).toBe('c1');
  expect(view!.div.querySelector('[role="status"]')!.textContent).toMatch(/^Starta med feil kunde/);
  await act(async () => {
    button(view!.div, 'Lagre').click();
    await Promise.resolve();
  });
  await settle();
  expect(sent[0]!.body).not.toHaveProperty('client');
  expect(sent[0]!.body).not.toHaveProperty('from');
});

it('stays open with the reason when the server refuses, and asks for a fresh view', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Denne kunden har alt ein samtale i runda.' }), {
          status: 409,
        }),
      ),
    ),
  );
  const refused = vi.fn();
  const done = vi.fn();
  view = mount(
    <StartSamtale
      edit
      row={started}
      guide={guide}
      names={[]}
      clients={others}
      me={null}
      onClose={() => undefined}
      onDone={done}
      onRefused={refused}
    />,
  );
  choose(kunde()!, 'c2');
  await act(async () => {
    button(view!.div, 'Lagre').click();
    await Promise.resolve();
  });
  await settle();
  expect(refused).toHaveBeenCalledTimes(1);
  expect(done).not.toHaveBeenCalled();
  expect(view.div.textContent).toContain('Denne kunden har alt ein samtale i runda.');
  expect(view.div.querySelector('[role="dialog"]')).not.toBeNull();
});
