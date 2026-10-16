// 3.2 (unit, jsdom): the seminar page. Bearer from `?c=`, never in a URL; the form checks its
// fields in nynorsk before it sends; the honeypot goes along when filled; «Du er påmeld» saves the
// calendar file from memory; English on request; broken links and the held phase.
import { act } from 'preact/test-utils';
import { render } from 'preact';
import { findBokmal } from '@varde/schema/i18n/nn-stoplist';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicSeminar } from '../src/seminar/api.js';
import { SeminarPage } from '../src/seminar/page.js';
import { list, TEXTS } from '../src/seminar/texts.js';

const CODE = 'Abcdefghijklmnopqrstuv';
const root = document.createElement('div');
document.body.appendChild(root);

const seminar = (over: Partial<PublicSeminar> = {}): PublicSeminar => ({
  languages: ['nn', 'en'],
  topic: { nn: 'Passord og MFA', en: 'Passwords and MFA' },
  when: { nn: 'torsdag 5. november 2026, kl. 09.00–11.30', en: 'Thursday 5 November 2026, 09:00–11:30' },
  place: 'Vardahei IT, Sogndal',
  format: 'onsite',
  clients: [
    { key: 'syntetisk-a', name: 'Syntetisk A' },
    { key: 'syntetisk-b', name: 'Syntetisk B' },
  ],
  phase: 'open',
  consent: {
    version: 'pamelding-v1',
    invite_version: 'invitasjon-v1',
    nn: { short: 'Eg samtykkjer.', invite: 'Eg vil ha invitasjonar.', full: ['Heile teksten.'] },
    en: { short: 'I agree.', invite: 'I want invitations.', full: ['The whole text.'] },
  },
  ...over,
});
const json = (status: number, body: unknown) => ({
  ok: status < 400,
  status,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
});

let fetcher: ReturnType<typeof vi.fn>;
async function open(view: PublicSeminar | number, post: number = 200) {
  fetcher = vi.fn((url: string) =>
    Promise.resolve(
      url === '/api/public/seminar'
        ? typeof view === 'number'
          ? json(view, { message: 'x' })
          : json(200, view)
        : url.startsWith('/api/public/seminar/calendar')
          ? json(200, 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n')
          : json(post, post === 200 ? { registered: true } : { message: 'x' }),
    ),
  );
  vi.stubGlobal('fetch', fetcher);
  history.replaceState(null, '', `/s?c=${CODE}`);
  await act(() => render(<SeminarPage />, root));
  await vi.waitFor(() => expect(root.querySelector('[aria-busy="true"]')).toBeNull());
}
const input = (selector: string, value: string) =>
  act(() => {
    const el = root.querySelector<HTMLInputElement>(selector)!;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const click = (selector: string) => act(() => root.querySelector<HTMLElement>(selector)!.click());
const submit = () =>
  act(() => {
    root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

beforeEach(() => {
  document.documentElement.lang = 'nn';
});
afterEach(async () => {
  await act(() => render(null, root));
  vi.unstubAllGlobals();
});

describe('seminar page (3.2)', () => {
  it('reads the code from the link and sends it only as a bearer', async () => {
    await open(seminar());
    expect(fetcher).toHaveBeenCalledWith(
      '/api/public/seminar',
      expect.objectContaining({ headers: { Authorization: `Bearer ${CODE}` } }),
    );
    expect(root.querySelector('h1')?.textContent).toBe('Passord og MFA');
    expect(root.textContent).toContain('torsdag 5. november 2026, kl. 09.00–11.30');
    expect(root.textContent).toContain('For Syntetisk A og Syntetisk B');
    expect(root.textContent).not.toContain(CODE);
  });

  it('checks the fields before sending, in nynorsk, and focuses the first wrong one', async () => {
    await open(seminar());
    await submit();
    expect(fetcher).toHaveBeenCalledTimes(1);
    for (const text of ['Skriv namnet ditt.', 'Vel bedrift, eller skriv namnet på bedrifta.', 'Skriv ei gyldig e-postadresse.', 'Kryss av for at vi kan lagre opplysningane for påmeldinga, så kan du melde deg på.'])
      expect(root.textContent).toContain(text);
    expect(document.activeElement?.id).toBe('sem-namn');
    expect(root.querySelector('#sem-namn')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('registers with a client, the consent version and the honeypot when filled; then «Du er påmeld» and the calendar', async () => {
    await open(seminar());
    await input('#sem-namn', 'ZZ Deltakar');
    await click('input[value="syntetisk-b"]');
    await input('#sem-epost', 'zz@example.test');
    await click('#sem-samtykke');
    await input('input[name="website"]', 'bot');
    await submit();
    await vi.waitFor(() => expect(root.querySelector('h1')?.textContent).toBe('Du er påmeld'));
    const [url, init] = fetcher.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/api/public/seminar/registrations');
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'ZZ Deltakar',
      email: 'zz@example.test',
      company: { client: 'syntetisk-b' },
      consent: 'pamelding-v1',
      lang: 'nn',
      website: 'bot',
    });
    const created = vi.fn(() => 'blob:seminar');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }));
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await click('#kalender');
    await vi.waitFor(() => expect(clicked).toHaveBeenCalled());
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/public/seminar/calendar?lang=nn',
      expect.objectContaining({ headers: { Authorization: `Bearer ${CODE}` } }),
    );
    clicked.mockRestore();
  });

  it('own company text and English; a full seminar says so in English', async () => {
    await open(seminar(), 429);
    await click('#sprak-en');
    expect(root.querySelector('h1')?.textContent).toBe('Passwords and MFA');
    expect(document.documentElement.lang).toBe('en');
    expect(root.textContent).toContain('I agree.');
    await input('#sem-namn', 'ZZ Person');
    await click('input[value="*"]');
    await input('#sem-anna', 'Eige firma');
    await input('#sem-epost', 'zz@example.test');
    await click('#sem-samtykke');
    await submit();
    await vi.waitFor(() => expect(root.querySelector('[role="alert"]')?.textContent).toContain('Too many registrations'));
    expect(JSON.parse((fetcher.mock.calls[1] as [string, RequestInit])[1].body as string)).toMatchObject({
      company: { name: 'Eige firma' },
      lang: 'en',
    });
  });

  it('two boxes: the required one for this registration, the optional one for invitations, not ticked', async () => {
    await open(seminar());
    const required = root.querySelector<HTMLInputElement>('#sem-samtykke')!;
    const optional = root.querySelector<HTMLInputElement>('#sem-invitasjon')!;
    expect(required.checked).toBe(false);
    expect(optional.checked).toBe(false);
    expect(required.closest('label')?.textContent).toBe('Eg samtykkjer.');
    expect(optional.closest('label')?.textContent).toBe('Eg vil ha invitasjonar. (valfritt)');
    // Only the required box is needed to register; the optional one goes along when ticked.
    await input('#sem-namn', 'ZZ Deltakar');
    await click('input[value="syntetisk-a"]');
    await input('#sem-epost', 'zz@example.test');
    await submit();
    expect(root.textContent).toContain('Kryss av for at vi kan lagre opplysningane for påmeldinga, så kan du melde deg på.');
    expect(fetcher).toHaveBeenCalledTimes(1);
    await click('#sem-samtykke');
    await click('#sem-invitasjon');
    await submit();
    await vi.waitFor(() => expect(root.querySelector('h1')?.textContent).toBe('Du er påmeld'));
    expect(JSON.parse((fetcher.mock.calls[1] as [string, RequestInit])[1].body as string)).toMatchObject({
      consent: 'pamelding-v1',
      invite: 'invitasjon-v1',
    });
  });

  it('the full consent opens on request', async () => {
    await open(seminar());
    const more = root.querySelector('#samtykke-meir')!;
    expect(more.getAttribute('data-open')).toBe('false');
    await click('.sem-samtykke .linkbtn');
    expect(more.getAttribute('data-open')).toBe('true');
    expect(root.textContent).toContain('Heile teksten.');
  });

  it('a replaced link says so (ADR-009), with the contact of Vardahei IT', async () => {
    fetcher = vi.fn(() =>
      Promise.resolve(json(403, { message: 'Lenkja er bytt ut. Spør den som sende deg ho om den nye.' })),
    );
    vi.stubGlobal('fetch', fetcher);
    history.replaceState(null, '', `/s?c=${CODE}`);
    await act(() => render(<SeminarPage />, root));
    await vi.waitFor(() => expect(root.querySelector('h1')?.textContent).toBe('Lenkja er bytt ut'));
    expect(root.querySelector('[data-state="revoked"]')).not.toBeNull();
    expect(root.textContent).toContain('post@vardahei.no');
  });

  it('a broken link shows its own screen with the contact of Vardahei IT', async () => {
    await open(403);
    expect(root.querySelector('h1')?.textContent).toBe('Denne lenkja verkar ikkje');
    expect(root.textContent).toContain('post@vardahei.no');
    expect(root.querySelector('form')).toBeNull();
  });

  it('after the seminar: no form, the material or a note that it is not out yet', async () => {
    await open(seminar({ phase: 'held', consent: null, materials: [{ title: 'Lysark', url: 'https://example.test/lysark.pdf' }] }));
    expect(root.querySelector('form')).toBeNull();
    const link = root.querySelector<HTMLAnchorElement>('.sem-materiell a')!;
    expect(link.href).toBe('https://example.test/lysark.pdf');
    expect(link.rel).toBe('noopener noreferrer');
    expect(link.target).toBe('_blank');
    await act(() => render(null, root));
    await open(seminar({ phase: 'held', consent: null, materials: [] }));
    expect(root.textContent).toContain('Materiellet er ikkje lagt ut enno.');
  });
});

describe('texts of the seminar page', () => {
  it('nynorsk and English have the same keys; nynorsk has no bokmål forms', () => {
    expect(Object.keys(TEXTS.en).sort()).toEqual(Object.keys(TEXTS.nn).sort());
    for (const [key, value] of Object.entries(TEXTS.nn)) expect(findBokmal(value), key).toEqual([]);
  });
  it('lists names with «og» / «and»', () => {
    expect(list(['A'], 'nn')).toBe('A');
    expect(list(['A', 'B', 'C'], 'nn')).toBe('A, B og C');
    expect(list(['A', 'B'], 'en')).toBe('A and B');
  });
});
