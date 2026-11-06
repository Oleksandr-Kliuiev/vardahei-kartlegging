// The start of a conversation (2.20) as in the concept: a dialog in the middle of the screen with the
// guide, the people from the client (a role, a name if they want), names from Vardahei to tick and the
// day. «Avbryt», Escape and the veil close it; «Endre» corrects the same fields. What reaches the API is
// exactly what was chosen, and a name typed without «Legg til» is not lost.
import { afterEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { clock, longDate, today as todayOf } from '../src/samtale-models.js';
import { StartSamtale, type StartRow, unique } from '../src/samtale-start.js';
import { button, mount, settle } from './support.js';

const row: StartRow = {
  id: 'iv1',
  client: { name: 'Rekneskap 01' },
  held_on: null,
  interviewees: [],
  interviewers: [],
};
const guide = { title: 'Kartlegging nøkkelpersonar', label: 'v1', question_count: 27 };
const today = new Date().toLocaleDateString('sv-SE');
let view: ReturnType<typeof mount> | undefined;
afterEach(() => {
  view?.close();
  view = undefined;
  vi.unstubAllGlobals();
});
function input(el: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const field = (label: string) =>
  view!.div.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
const boxes = () =>
  [...view!.div.querySelectorAll<HTMLLabelElement>('.sm-vi-namn')].map((l) => [
    l.textContent,
    l.querySelector('input')!.checked,
  ]);
function server() {
  const sent: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      sent.push({ url, body: JSON.parse(init!.body as string) as unknown });
      return Promise.resolve(new Response(JSON.stringify({ id: 'iv1' }), { status: 201 }));
    }),
  );
  return sent;
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
  expect(view.div.querySelector<HTMLInputElement>('input[type="date"]')!.value).toBe(today);
  expect(button(view.div, 'Avbryt').type).toBe('button');
});

it('sends the people, the ticked names and a name typed but not yet added', async () => {
  const sent = server();
  const done = vi.fn();
  view = mount(
    <StartSamtale
      row={row}
      guide={guide}
      names={['Oleksandr']}
      me="Asbjørn"
      onClose={() => undefined}
      onDone={done}
    />,
  );
  input(field('Namn (valfritt)'), 'Kari Nordmann');
  act(() => button(view!.div, 'Legg til person').click());
  expect(document.activeElement).toBe(field('Rolle, person 2'));
  input(field('Rolle, person 2'), ' økonomi ');
  act(() => view!.div.querySelectorAll<HTMLInputElement>('.sm-vi-namn input')[1]!.click());
  act(() => button(view!.div, 'Legg til namn').click());
  input(field('Namn frå Vardahei'), 'Bjarte');
  act(() => {
    field('Namn frå Vardahei').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
  });
  expect(boxes()).toEqual([
    ['Asbjørn', true],
    ['Oleksandr', true],
    ['Bjarte', true],
  ]);
  // Typed, not added, then «Start samtalen»: it still goes with the others.
  input(field('Namn frå Vardahei'), 'Silje');
  act(() => button(view!.div, 'Start samtalen').click());
  await settle();
  const body = {
    held_on: today,
    interviewees: [{ role: 'dagleg leiar', name: 'Kari Nordmann' }, { role: 'økonomi' }],
    interviewers: ['Asbjørn', 'Oleksandr', 'Bjarte', 'Silje'],
  };
  expect(sent).toEqual([{ url: '/api/admin/interviews/iv1/start', body }]);
  expect(done).toHaveBeenCalledWith(body);
});

it('will not start while a name has no role or the day is empty, and a person can go again', () => {
  const sent = server();
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
  expect(view.div.querySelector('.sm-dlg-feil')!.textContent).toBe(
    'Skriv rolla til alle som er med.',
  );
  expect(field('Rolle, person 2').getAttribute('aria-invalid')).toBe('true');
  expect(button(view.div, 'Start samtalen').disabled).toBe(true);
  act(() => view!.div.querySelector<HTMLButtonElement>('[aria-label="Fjern person 2"]')!.click());
  expect(button(view.div, 'Start samtalen').disabled).toBe(false);
  input(view.div.querySelector<HTMLInputElement>('input[type="date"]')!, '');
  expect(button(view.div, 'Start samtalen').disabled).toBe(true);
  expect(sent).toEqual([]);
});

it('«Endre» opens with what was saved and says «Lagre»; Escape, the veil and «Avbryt» close it', () => {
  const close = vi.fn();
  view = mount(
    <StartSamtale
      edit
      row={{
        ...row,
        held_on: '2026-11-10',
        interviewees: [{ role: 'dagleg leiar', name: 'Kari Nordmann' }, { role: 'økonomi' }],
        interviewers: ['Oleksandr'],
      }}
      guide={guide}
      names={['Asbjørn', 'Oleksandr']}
      me="Asbjørn"
      onClose={close}
      onDone={() => undefined}
    />,
  );
  expect(view.div.querySelector('h2')!.textContent).toBe('Endre samtalen med Rekneskap 01');
  expect(field('Namn (valfritt)').value).toBe('Kari Nordmann');
  expect(field('Rolle, person 2').value).toBe('økonomi');
  expect(boxes()).toEqual([
    ['Oleksandr', true],
    ['Asbjørn', false],
  ]);
  expect(view.div.querySelector<HTMLInputElement>('input[type="date"]')!.value).toBe('2026-11-10');
  expect(button(view.div, 'Lagre').disabled).toBe(false);
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
  act(() => {
    view!.div
      .querySelector('.sm-dlg-slor')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  // A press inside the dialog is not a press on the veil.
  act(() => {
    view!.div.querySelector('h2')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  act(() => button(view!.div, 'Avbryt').click());
  expect(close).toHaveBeenCalledTimes(3);
});

it('writes days and times in Nynorsk whatever the browser carries', () => {
  const year = new Date().getFullYear();
  expect(longDate(`${year}-11-25`)).toBe('25. november');
  expect(longDate('2025-05-04')).toBe('4. mai 2025');
  expect(longDate(null)).toBe('');
  expect(clock(new Date(2026, 10, 6, 21, 53))).toBe('21:53');
  expect(clock(new Date(2026, 10, 6, 9, 5))).toBe('09:05');
  expect(todayOf(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
});

it('keeps each name once, whatever its case and spaces', () => {
  expect(unique([' Asbjørn', 'asbjørn', '', 'Oleksandr ', 'ASBJØRN'])).toEqual([
    'Asbjørn',
    'Oleksandr',
  ]);
});
