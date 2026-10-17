// Seminar section of the admin (3a, unit): the list shows counts without names, the participant
// list is read only on request and says who wants invitations (the admin can only withdraw that
// consent), a new seminar posts what the form says, and the deletion page words a participant
// deletion.
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { participantText } from '../src/deletion-page.js';
import { SeminarPage } from '../src/seminar-page.js';
import { KontaktSjekk } from '../src/kontaktar.js';
import { bodyOf, emptyDraft, names, perCompany } from '../src/seminar-models.js';
import { Toasts } from '../src/shell.js';
import { button, mount, settle } from './support.js';

const ID = '00000000-0000-4000-8000-00000000a001';
const seminar = {
  id: ID,
  topic_nn: 'Passord og MFA',
  topic_en: null,
  date: '2026-11-05',
  start: '09:00',
  end: '11:30',
  when: 'torsdag 5. november 2026, kl. 09.00–11.30',
  starts_at: '2026-11-05T08:00:00.000Z',
  ends_at: '2026-11-05T10:30:00.000Z',
  place: 'Vardahei IT, Sogndal',
  format: 'onsite',
  languages: ['nn'],
  clients: [
    { id: 'c1', name: 'Syntetisk A' },
    { id: 'c2', name: 'Syntetisk B' },
  ],
  link: 'https://varde.test/s?c=Abcdefghijklmnopqrstuv',
  status: 'planned',
  registrations: { total: 3, companies: [{ company: 'Syntetisk A', n: 2 }], other: 1 },
  findings: [],
};
const rows = [
  {
    registration: 'r1',
    contact: 'k1',
    name: 'ZZ Deltakar',
    company: 'Syntetisk A',
    client: 'c1',
    email: 'zz@example.test',
    lang: 'nn',
    registered_at: '2026-10-16T08:00:00Z',
    invite: true,
  },
];

let view: ReturnType<typeof mount> | undefined;
const fetcher = vi.fn((path: string, init?: RequestInit) => {
  const body =
    path === '/api/admin/seminars' && init?.method === 'POST'
      ? { id: ID }
      : path === '/api/admin/seminars'
        ? { seminars: [seminar], contacts_to_review: 1 }
        : path === `/api/admin/seminars/${ID}`
          ? seminar
          : path.endsWith('/registrations')
            ? { rows }
            : path.includes('/invitation?lang=')
              ? { text: 'Hei!\n\nVardahei IT inviterer til seminaret «Passord og MFA».', link: seminar.link }
            : path === '/api/admin/contacts/review'
              ? { rows: [{ id: 'k1', name: 'ZZ Gammal', company: 'X', email: 'gammal@example.test', last_confirmed_at: '2025-01-02T10:00:00Z', registrations: 0 }] }
              : path === '/api/admin/clients'
                ? [{ id: 'c1', name: 'Syntetisk A' }]
                : path.endsWith('/live')
                  ? { poll: null, versions: [], presenter: { valid_from: '', valid_to: '', valid_text: '', valid_now: false, active: null } }
                  : path.endsWith('/rounds')
                    ? { before: null, live: null, after: null, choices: { before: [], after: [] }, versions: [] }
                    : path.endsWith('/before-after')
                      ? { class: 'aggregate', caveats: ['Vi ser endringa, men kan ikkje seie at seminaret gjorde det.'], ready: false, missing: { before: true, after: true } }
                      : { ok: true };
  return Promise.resolve(new Response(JSON.stringify(body)));
});
beforeEach(() => {
  fetcher.mockClear();
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  view?.close();
  view = undefined;
  vi.unstubAllGlobals();
});
const calls = (match: string) => fetcher.mock.calls.filter(([p]) => p.includes(match));

describe('seminar list', () => {
  it('shows topic, time, clients and the count per company, never names', async () => {
    view = mount(<SeminarPage />, true);
    await settle();
    const text = view.div.textContent ?? '';
    expect(text).toContain('Passord og MFA');
    expect(text).toContain('For Syntetisk A og Syntetisk B');
    expect(text).toContain('3 påmelde');
    expect(text).toContain('1 kontakt ventar på den årlege sjekken.');
    expect(view.div.querySelector('a[href="/admin/personvern/kontaktar"]')).not.toBeNull();
    expect(calls('/registrations')).toHaveLength(0);
    expect(calls('/contacts/review')).toHaveLength(0);
  });
  it('the contacts to check load on request under «Personvern» and can be confirmed', async () => {
    view = mount(<KontaktSjekk />, true);
    await settle();
    expect(view.div.textContent).toContain('1 kontakt ventar på den årlege sjekken.');
    expect(calls('/contacts/review')).toHaveLength(0);
    act(() => {
      button(view!.div, 'Vis kontaktane').click();
    });
    await settle();
    expect(view.div.textContent).toContain('ZZ Gammal');
    act(() => {
      button(view!.div, 'Stadfest').click();
    });
    await settle();
    expect(fetcher).toHaveBeenCalledWith('/api/admin/contacts/k1/confirm', expect.objectContaining({ method: 'POST' }));
    expect(view.div.textContent).not.toContain('ZZ Gammal');
  });
  it('a new seminar posts the form; no English topic unless English is on', async () => {
    view = mount(<SeminarPage />, true);
    await settle();
    act(() => {
      button(view!.div, 'Nytt seminar').click();
    });
    await settle();
    const set = (selector: string, value: string) => {
      act(() => {
        const el = view!.div.querySelector<HTMLInputElement>(selector)!;
        // React tracks the value setter of the prototype; the change must go through it.
        Reflect.set(HTMLInputElement.prototype, 'value', value, el);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    const inputs = view.div.querySelectorAll<HTMLInputElement>('.sem-form input.input');
    expect(inputs.length).toBeGreaterThanOrEqual(5);
    set('.sem-form input[maxlength="160"]', 'Passord og MFA');
    set('.sem-form input[type="date"]', '2026-11-05');
    set('.sem-form input[maxlength="200"]', 'Sogndal');
    act(() => {
      view!.div.querySelector<HTMLInputElement>('.sem-kundar input')!.click();
    });
    act(() => {
      view!.div.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await settle();
    const post = fetcher.mock.calls.find(([p, i]) => p === '/api/admin/seminars' && i?.method === 'POST');
    expect(JSON.parse(post![1]!.body as string)).toEqual({
      topic_nn: 'Passord og MFA',
      date: '2026-11-05',
      start: '09:00',
      end: '11:00',
      place: 'Sogndal',
      format: 'onsite',
      languages: ['nn'],
      clients: ['c1'],
    });
    expect(window.location.pathname).toBe(`/admin/seminars/${ID}`);
  });
});

describe('one seminar', () => {
  it('counts first; the name list is read only on request', async () => {
    view = mount(
      <Toasts>
        <SeminarPage id={ID} />
      </Toasts>,
      true,
    );
    await settle();
    expect(view.div.querySelector('[data-testid="pamelde"]')?.textContent).toBe('3');
    expect(view.div.textContent).toContain('Syntetisk A 2 · andre 1');
    // How long the data lives: the registration 90 days, the contact with it unless it wants invitations.
    expect(view.div.textContent).toContain(
      'Påmeldinga blir sletta 90 dagar etter seminaret. Namn og e-post blir sletta samstundes, med mindre personen vil ha invitasjonar eller er påmeld eit anna seminar.',
    );
    expect(calls('/registrations')).toHaveLength(0);
    expect(view.div.textContent).not.toContain('zz@example.test');
    act(() => {
      button(view!.div, 'Vis namnelista').click();
    });
    await settle();
    expect(calls('/registrations')).toHaveLength(1);
    expect(view.div.querySelector('table')?.textContent).toContain('zz@example.test');
    // «Invitasjon»: ja or nei per person.
    const heads = [...view.div.querySelectorAll('thead th')].map((th) => th.textContent);
    const cells = [...view.div.querySelectorAll('tbody tr > *')].map((td) => td.textContent);
    expect(cells[heads.indexOf('Invitasjon')]).toBe('ja');
  });
  it('«Fjern påmelding» takes two presses and removes only that registration', async () => {
    view = mount(<SeminarPage id={ID} />, true);
    await settle();
    act(() => {
      button(view!.div, 'Vis namnelista').click();
    });
    await settle();
    act(() => {
      button(view!.div, 'Fjern påmelding').click();
    });
    expect(fetcher.mock.calls.some(([, i]) => i?.method === 'DELETE')).toBe(false);
    act(() => {
      button(view!.div, 'Stadfest').click();
    });
    await settle();
    expect(fetcher).toHaveBeenCalledWith(
      `/api/admin/seminars/${ID}/registrations/r1`,
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(view.div.textContent).toContain('Ingen er påmelde no.');
  });
  it('«Ny lenkje» takes two presses and says what stops working', async () => {
    view = mount(
      <Toasts>
        <SeminarPage id={ID} />
      </Toasts>,
      true,
    );
    await settle();
    expect(view.div.textContent).toContain('plakatar som er skrivne ut');
    act(() => {
      button(view!.div, 'Ny lenkje').click();
    });
    expect(fetcher.mock.calls.some(([p]) => p.endsWith('/reissue'))).toBe(false);
    act(() => {
      button(view!.div, 'Stadfest ny lenkje').click();
    });
    await settle();
    expect(fetcher).toHaveBeenCalledWith(`/api/admin/seminars/${ID}/reissue`, expect.objectContaining({ method: 'POST' }));
  });
  it('the admin corrects a contact in the name list: name and own company text', async () => {
    view = mount(
      <Toasts>
        <SeminarPage id={ID} />
      </Toasts>,
      true,
    );
    await settle();
    act(() => {
      button(view!.div, 'Vis namnelista').click();
    });
    await settle();
    act(() => {
      view!.div.querySelector<HTMLButtonElement>('button[aria-label="Endre ZZ Deltakar"]')!.click();
    });
    await settle();
    const form = view.div.querySelector<HTMLFormElement>('form[aria-label="Endre kontakten"]')!;
    expect(form.textContent).toContain('Endringa gjeld kontakten i alle seminar.');
    const set = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
      act(() => {
        Reflect.set(Object.getPrototypeOf(el) as object, 'value', value, el);
        el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
      });
    };
    set(form.querySelector('input')!, 'ZZ Retta Namn');
    set(form.querySelector('select')!, '');
    set(form.querySelectorAll('input')[1]!, 'Eige firma AS');
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await settle();
    const put = fetcher.mock.calls.find(([p, i]) => p === '/api/admin/contacts/k1' && i?.method === 'PUT');
    expect(JSON.parse(put![1]!.body as string)).toEqual({ name: 'ZZ Retta Namn', company: 'Eige firma AS', client: null });
    expect(view.div.querySelector('table')?.textContent).toContain('ZZ Retta Namn');
    expect(view.div.querySelector('table')?.textContent).toContain('Eige firma AS');
  });
  it('«Endre kontakten» withdraws the consent to invitations; it never offers to give it', async () => {
    view = mount(
      <Toasts>
        <SeminarPage id={ID} />
      </Toasts>,
      true,
    );
    await settle();
    act(() => {
      button(view!.div, 'Vis namnelista').click();
    });
    await settle();
    const edit = async () => {
      act(() => {
        view!.div.querySelector<HTMLButtonElement>('button[aria-label="Endre ZZ Deltakar"]')!.click();
      });
      await settle();
      return view!.div.querySelector<HTMLFormElement>('form[aria-label="Endre kontakten"]')!;
    };
    const form = await edit();
    const box = form.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box.closest('label')?.textContent?.trim()).toBe('Ta bort samtykket til invitasjonar');
    expect(box.checked).toBe(false);
    expect(form.textContent).toContain('Samtykket til invitasjonar kan berre personen sjølv gi, på påmeldingssida.');
    act(() => {
      box.click();
    });
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await settle();
    const put = fetcher.mock.calls.find(([p, i]) => p === '/api/admin/contacts/k1' && i?.method === 'PUT');
    expect(JSON.parse(put![1]!.body as string)).toEqual({
      name: 'ZZ Deltakar',
      client: 'c1',
      withdraw_invite: true,
    });
    const cells = [...view.div.querySelectorAll('tbody tr > *')].map((td) => td.textContent);
    expect(cells).toContain('nei');
    // Without the consent there is nothing to tick: only the person can give it.
    const again = await edit();
    expect(again.querySelector('input[type="checkbox"]')).toBeNull();
    expect(again.textContent).toContain('Personen har ikkje sagt ja til invitasjonar.');
  });
  it('«Materiell» posts a title and a link and says when the participants see it', async () => {
    view = mount(<SeminarPage id={ID} />, true);
    await settle();
    act(() => {
      button(view!.div, 'Materiell').click();
    });
    expect(view.div.textContent).toContain('Ikkje noko materiell enno.');
    expect(view.div.textContent).toContain('Synleg etter seminaret');
    const set = (selector: string, value: string) => {
      act(() => {
        const el = view!.div.querySelector<HTMLInputElement>(selector)!;
        Reflect.set(HTMLInputElement.prototype, 'value', value, el);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    set('.sem-form input[maxlength="200"]', 'Lysark');
    set('.sem-form input[type="url"]', 'https://example.test/lysark.pdf');
    act(() => {
      view!.div.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await settle();
    const post = fetcher.mock.calls.find(([p]) => p === `/api/admin/seminars/${ID}/materials`);
    expect(JSON.parse(post![1]!.body as string)).toEqual({ title: 'Lysark', url: 'https://example.test/lysark.pdf' });
  });
  it('«Invitasjon» shows the letter and the link; the package, the calendar file and the poster are downloads', async () => {
    view = mount(
      <Toasts>
        <SeminarPage id={ID} />
      </Toasts>,
      true,
    );
    await settle();
    act(() => {
      button(view!.div, 'Invitasjon').click();
    });
    await settle();
    expect(view.div.querySelector('textarea')?.value).toContain('Vardahei IT inviterer til seminaret');
    expect(view.div.querySelector('.sem-lenkje code')?.textContent).toBe(seminar.link);
    const links = [...view.div.querySelectorAll<HTMLAnchorElement>('.sem-last-ned a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Last ned invitasjon', `/api/admin/seminars/${ID}/invitation.zip`],
      ['Kalenderfil (ICS)', `/api/admin/seminars/${ID}/calendar.ics?lang=nn`],
      ['Opne plakaten (A4)', `/admin/poster/seminar/${ID}?lang=nn`],
    ]);
    expect(view.div.textContent).toContain('Varde sender ingenting sjølv.');
    // Nothing is posted from this tab: no request leaves except reading the letter.
    expect(fetcher.mock.calls.filter(([, i]) => i?.method && i.method !== 'GET')).toEqual([]);
  });
  it('«Live» has the live questions (3b); «Før og etter» has the rounds before, during and after (3c)', async () => {
    view = mount(<SeminarPage id={ID} />, true);
    await settle();
    act(() => {
      button(view!.div, 'Live').click();
    });
    await settle();
    expect(calls('/live')).toHaveLength(1);
    expect(view.div.textContent).toContain('Spørsmål på mobilen under seminaret, med resultat på storskjermen.');
    act(() => {
      button(view!.div, 'Før og etter').click();
    });
    await settle();
    expect(calls('/rounds')).toHaveLength(1);
    expect(view.div.querySelector('#rundar-tittel')?.textContent).toBe('Rundar');
    expect(view.div.querySelector('#for-etter-tittel')?.textContent).toBe('Før og etter');
    expect(view.div.textContent).toContain('Vi ser endringa, men kan ikkje seie at seminaret gjorde det.');
    expect(view.div.textContent).toContain('Før seminaret');
    expect(view.div.textContent).toContain('Etter seminaret');
    expect(view.div.textContent).not.toContain('Kjem i neste steg');
  });
});

describe('helpers', () => {
  it('names, counts and the body of the form', () => {
    expect(names(['A', 'B', 'C'])).toBe('A, B og C');
    expect(perCompany({ total: 3, companies: [{ company: 'A', n: 2 }], other: 1 })).toBe('A 2 · andre 1');
    expect(bodyOf({ ...emptyDraft(), topic_en: 'x' }).topic_en).toBeUndefined();
    expect(bodyOf({ ...emptyDraft(), topic_en: 'x', languages: ['nn', 'en'] }).topic_en).toBe('x');
  });
  it('the deletion page says what a participant deletion removes', () => {
    expect(participantText(1, 2)).toBe('Kontakten og 2 påmeldingar blir sletta.');
    expect(participantText(1, 1)).toBe('Kontakten og 1 påmelding blir sletta.');
    expect(participantText(0, 0)).toBe('Fann ingen deltakar med den e-postadressa.');
  });
});
