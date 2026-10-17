// 2.16: the library of surveys by title, «Nytt skjema» from a start for each kind, and «Innstillingar».
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsPage } from '../src/settings-page.js';
import { Toasts } from '../src/shell.js';
import { SurveysPage } from '../src/surveys-page.js';
import { mount, settle } from './support.js';

let view: ReturnType<typeof mount> | undefined;
afterEach(() => {
  view?.close();
  view = undefined;
  vi.unstubAllGlobals();
});
const library = [
  {
    id: 't1',
    key: 'tryggleik',
    audience: 'client_survey',
    title: 'IT-sikkerheit i kvardagen',
    question_count: 41,
    languages: ['nn', 'en'],
    rounds: 3,
    draft: { id: 'd1', version_no: 3, left: 2 },
    versions: [
      { id: 'd1', label: 'v3', version_no: 3, status: 'draft' },
      {
        id: 'p2',
        label: 'v2',
        version_no: 2,
        status: 'published',
        published_at: '2026-10-17T10:00:00Z',
      },
    ],
  },
  {
    id: 't2',
    key: 'ki',
    audience: 'seminar_after',
    title: 'Etter KI-seminaret',
    question_count: 4,
    languages: ['nn'],
    rounds: 0,
    draft: null,
    versions: [
      {
        id: 'p9',
        label: 'v1',
        version_no: 1,
        status: 'published',
        published_at: '2026-10-12T10:00:00Z',
      },
    ],
  },
];
function serve(answer: (url: string, method: string, body: unknown) => unknown) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body: unknown = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ url, method, body });
      const out = answer(url, method, body);
      return Promise.resolve(
        out instanceof Response ? out : new Response(JSON.stringify(out ?? {}), { status: 200 }),
      );
    }),
  );
  return calls;
}
const byText = (div: HTMLElement, text: string) =>
  [...div.querySelectorAll<HTMLElement>('button, label, a')].find(
    (b) => b.textContent?.trim() === text,
  )!;

it('the library names each survey, says what is left in its draft and opens the draft', async () => {
  serve(() => library);
  view = mount(<SurveysPage />, true);
  await settle();
  const cards = [...view.div.querySelectorAll<HTMLAnchorElement>('.bib-kort')];
  expect(cards.map((c) => c.querySelector('.bib-namn')!.textContent)).toEqual([
    'Etter KI-seminaret',
    'IT-sikkerheit i kvardagen',
  ]);
  expect(cards[1]!.textContent).toContain('41 spørsmål · Nynorsk, English · Brukt i 3 rundar');
  expect(cards[1]!.textContent).toContain('Utkast v32 ting att før publisering');
  expect(cards[1]!.getAttribute('href')).toBe('/admin/surveys/d1');
  expect(cards[0]!.textContent).toContain('Ikkje brukt i rundar');
  expect(cards[0]!.textContent).toContain('Publisert v1');
  act(() => cards[1]!.click());
  expect(location.pathname).toBe('/admin/surveys/d1');
});

it('«Nytt skjema» makes a survey from a start, or a copy, and opens it', async () => {
  const calls = serve((url, method) => (method === 'POST' ? { id: 'ny-versjon' } : library));
  view = mount(<SurveysPage />, true);
  await settle();
  act(() => byText(view!.div, 'Nytt skjema').click());
  act(() =>
    byText(view!.div, 'Etter seminaretKort og utan namn, etter seminaret.')
      .querySelector('input')!
      .click(),
  );
  act(() => view!.div.querySelector<HTMLInputElement>('.bib-sjekk input')!.click());
  const title = view.div.querySelector<HTMLInputElement>('input[name="title"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      title,
      'Etter haustseminaret',
    );
    title.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => {
    view!.div
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await settle();
  expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
    title: 'Etter haustseminaret',
    audience: 'seminar_after',
    identification: 'none',
    required_languages: ['nn', 'en'],
  });
  expect(location.pathname).toBe('/admin/surveys/ny-versjon');
  // A copy starts from the newest published version, under a title of its own.
  act(() =>
    byText(
      view!.div,
      'Kopi av eit skjemaStartar frå den nyaste publiserte versjonen av eit skjema du har.',
    )
      .querySelector('input')!
      .click(),
  );
  expect(view.div.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe(
    'Etter KI-seminaret (kopi)',
  );
  act(() => {
    view!.div
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await settle();
  expect(calls.filter((c) => c.method === 'POST').at(-1)!.body).toMatchObject({
    title: 'Etter KI-seminaret (kopi)',
    copy_from: 'p9',
  });
});

it('«Innstillingar» shows where the defaults come from and saves them', async () => {
  const defaults = {
    contact: {
      name: 'Vardahei IT',
      phone: '+47 000',
      email: 'post@example.invalid',
      hours: { nn: 'Kvardagar', en: 'Weekdays' },
    },
    sender: { nn: 'Gjengen', en: 'The team' },
    saved: false,
  };
  const calls = serve((url, method, body) =>
    method === 'PUT' ? { ...(body as object), saved: true } : defaults,
  );
  view = mount(
    <Toasts>
      <SettingsPage />
    </Toasts>,
    true,
  );
  await settle();
  expect(view.div.textContent).toContain('Henta frå det nyaste kundeskjemaet');
  const phone = view.div.querySelector<HTMLInputElement>('input[type="tel"]')!;
  expect(phone.value).toBe('+47 000');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      phone,
      '+47 111',
    );
    phone.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => {
    view!.div
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await settle();
  expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({
    contact: { ...defaults.contact, phone: '+47 111' },
    sender: defaults.sender,
  });
  expect(view.div.textContent).toContain('Nye skjema byrjar med dette.');
});
