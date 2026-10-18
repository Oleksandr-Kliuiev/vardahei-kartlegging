// The findings a seminar takes up (2.17, unit): per client and round, with the level, numbers and
// text of the client's result and the status chip of the client page; a link to the client page
// on that round, the one place to change the status; a short sentence when there are none; and
// the topic as the heading and the tab title of the page, also when the seminar comes from cache.
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findBokmal } from '../../../packages/schema/src/i18n/nn-stoplist.js';
import { App } from '../src/App.js';
import { KundePage } from '../src/kunde-page.js';
import { groupFindings, statusPage } from '../src/seminar-funn.js';
import type { SeminarFinding } from '../src/seminar-models.js';
import { SeminarPage } from '../src/seminar-page.js';
import { mount, settle, TestStream } from './support.js';

const ID = '00000000-0000-4000-8000-00000000a002';
const A = '00000000-0000-4000-8000-00000000c00a';
const B = '00000000-0000-4000-8000-00000000c00b';
const R1 = '00000000-0000-4000-8000-0000000000e1';
const R2 = '00000000-0000-4000-8000-0000000000e2';
const TOPIC = 'Phishing og falske fakturaer';

const row = (
  id: string,
  client: string | null,
  round: string,
  rule_key: string,
  status: string,
  changed_at: string,
): SeminarFinding => ({ id, client, round, rule_key, status, changed_at });
const FINDINGS = [
  row('b-12', B, R2, 'tryggleik.f12', 'in_seminar', '2026-10-17T10:00:00.000Z'),
  // Two releases of one rule each, in either order and with other statuses: the newest status is
  // the one the client page shows (neither the first nor the last row wins as such).
  row('a-14-old', A, R2, 'tryggleik.f14', 'in_seminar', '2026-10-15T10:00:00.000Z'),
  row('a-14', A, R2, 'tryggleik.f14', 'closed', '2026-10-17T12:00:00.000Z'),
  row('a-12', A, R2, 'tryggleik.f12', 'in_seminar', '2026-10-17T11:00:00.000Z'),
  row('a-12-old', A, R2, 'tryggleik.f12', 'closed', '2026-10-16T10:00:00.000Z'),
  // Taken up from an older round whose result no longer has the rule.
  row('a-8', A, R1, 'tryggleik.f8', 'in_seminar', '2026-10-17T13:00:00.000Z'),
];
const seminar = (
  findings: SeminarFinding[],
  clients = [
    { id: A, name: 'Syntetisk A' },
    { id: B, name: 'Syntetisk B' },
  ],
) => ({
  id: ID,
  topic_nn: TOPIC,
  topic_en: null,
  date: '2026-11-12',
  start: '09:00',
  end: '11:00',
  when: 'torsdag 12. november 2026, kl. 09.00–11.00',
  starts_at: '2026-11-12T08:00:00.000Z',
  ends_at: '2026-11-12T10:00:00.000Z',
  place: 'Vardahei IT, Sogndal',
  format: 'onsite',
  languages: ['nn'],
  clients,
  link: null,
  status: 'planned',
  registrations: { total: 0, companies: [] },
  materials: [],
  findings,
});
const finding = (key: string, level: string, tal: string, text: string) => ({
  key,
  n: 6,
  count: 2,
  share: 0.33,
  level,
  text,
  action: 'Gjer noko med det.',
  severity: 'risk',
  tal,
});
const dashboard = (findings: unknown[]) => ({
  template: 'tryggleik',
  mode: 'initials',
  source: 'released',
  roles: [],
  suppression_note: '',
  findings,
  zones: null,
  questions: [],
});
const RESULTS: Record<string, unknown[]> = {
  [`round=${R2}&client=${A}`]: [
    finding('tryggleik.f14', 'high', '2 av 6', 'brukar ikkje MFA eller veit ikkje'),
    finding('tryggleik.f12', 'medium', '3 av 6', 'veit ikkje kvar dei skal melde frå'),
  ],
  [`round=${R2}&client=${B}`]: [
    finding('tryggleik.f12', 'high', '4 av 9', 'veit ikkje kvar dei skal melde frå'),
  ],
  [`round=${R1}&client=${A}`]: [finding('tryggleik.f14', 'medium', '1 av 5', 'brukar ikkje MFA')],
};
const rc = (client: string, id: string) => ({
  id: `rc-${id}-${client}`,
  client_id: client,
  client: { name: client === A ? 'Syntetisk A' : 'Syntetisk B' },
  status: 'closed',
  deadline: null,
  population_snapshot: 10,
});
const ROUNDS = [
  { id: R2, name: 'Haust 2026', closed_at: '2026-10-16T10:00:00.000Z' },
  { id: R1, name: 'Runde 1', closed_at: '2026-01-31T10:00:00.000Z' },
].map((r) => ({
  ...r,
  status: 'closed',
  template_version_id: 'v',
  has_data: true,
  round_clients: [rc(A, r.id), rc(B, r.id)],
}));

/** The seminar the API has; none answers 404. */
let current: ReturnType<typeof seminar> | null = seminar(FINDINGS);
/** The query of a result that cannot be read (500). */
let broken = '';
const failure = (status: number, message: string) =>
  Promise.resolve(new Response(JSON.stringify({ message }), { status }));
const fetcher = vi.fn((path: string, init?: RequestInit) => {
  void init;
  if (path === `/api/admin/seminars/${ID}` && !current)
    return failure(404, 'Seminaret finst ikkje.');
  if (broken && path === `/api/admin/dashboard?${broken}`)
    return failure(500, 'Resultatet kan ikkje lesast no.');
  const result = path.startsWith('/api/admin/dashboard?') ? RESULTS[path.slice(21)] : undefined;
  const body =
    path === '/auth/me'
      ? { name: 'Syntetisk admin' }
      : path === '/api/admin/seminars'
        ? { seminars: current ? [current] : [], contacts_to_review: 0 }
        : path === `/api/admin/seminars/${ID}`
          ? current
          : path === '/api/admin/clients'
            ? [
                { id: A, name: 'Syntetisk A', slug: 'a', employee_count: 10 },
                { id: B, name: 'Syntetisk B', slug: 'b', employee_count: 9 },
              ]
            : path === '/api/admin/rounds'
              ? ROUNDS
              : path.startsWith('/api/admin/dashboard?')
                ? dashboard(result ?? [])
                : path.endsWith('/contacts/count')
                  ? { total: 0, review: 0 }
                  : path.endsWith('/finding-status')
                    ? { rows: [] }
                    : [];
  return Promise.resolve(new Response(JSON.stringify(body)));
});
let view: ReturnType<typeof mount> | undefined;
/** jsdom has no scrolling: a new page scrolls to the top (App.tsx), a card into view. */
const scrolled = vi.fn();
beforeEach(() => {
  current = seminar(FINDINGS);
  broken = '';
  fetcher.mockClear();
  scrolled.mockClear();
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('EventSource', TestStream);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    value: scrolled,
    configurable: true,
  });
});
afterEach(() => {
  view?.close();
  view = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const block = () =>
  view!.div.querySelector<HTMLElement>('section[aria-labelledby="sem-funn-tittel"]')!;
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();
/** A row of the list as its parts: the level (when the result has the finding), text and status. */
const parts = (li: Element) => {
  const finding = li.querySelector('.sem-funn-tekst')!.cloneNode(true) as Element;
  finding.querySelector('.chip')?.remove();
  const level = li.querySelector('.niva');
  return [...(level ? [text(level)] : []), text(finding), text(li.querySelector('.chip'))];
};

describe('findings of a seminar', () => {
  it('one row per rule, round and client: the newest status, grouped by client and round', () => {
    const groups = groupFindings(FINDINGS);
    expect(groups.map((g) => [g.client, g.round, g.findings.map((f) => f.id)])).toEqual([
      [B, R2, ['b-12']],
      [A, R2, ['a-14', 'a-12']],
      [A, R1, ['a-8']],
    ]);
    expect(groupFindings([])).toEqual([]);
  });
  it('the status is changed on the client page, opened on the round of the findings', () => {
    expect(statusPage({ client: A, round: R2 })).toBe(`/admin/clients/${A}?runde=${R2}`);
    expect(statusPage({ client: null, round: R2 })).toBe(`/admin/rounds/${R2}/resultat`);
  });
  it('shows client, round, level, numbers, text and status chip, and links to the client page', async () => {
    view = mount(<SeminarPage id={ID} />, true);
    await settle();
    await settle();
    const card = block();
    expect(card.querySelector('h2')?.textContent).toBe('Funn seminaret tek opp');
    expect(text(card.querySelector('.kort-hovud p'))).toBe('4 funn');
    // Clients by name, the newest round first.
    expect([...card.querySelectorAll('h3')].map(text)).toEqual([
      'Syntetisk A Haust 2026',
      'Syntetisk A Runde 1',
      'Syntetisk B Haust 2026',
    ]);
    const [a2, a1, b2] = [...card.querySelectorAll('.sem-funn-gruppe')];
    // The order of the result (the highest level first) and the chip of the client page.
    expect([...a2!.querySelectorAll('li')].map(parts)).toEqual([
      ['Høg', '2 av 6 brukar ikkje MFA eller veit ikkje', 'Ferdig'],
      ['Middels', '3 av 6 veit ikkje kvar dei skal melde frå', 'I seminar'],
    ]);
    expect([...a2!.querySelectorAll('li .chip')].map((c) => c.className)).toEqual([
      'chip ok',
      'chip accent',
    ]);
    // A finding that dropped out of the result has no editor anywhere: no link that leads nowhere.
    expect([...a1!.querySelectorAll('li')].map(parts)).toEqual([
      [
        'Funnet er ikkje lenger med i resultatet for runden, så statusen kan ikkje endrast.',
        'I seminar',
      ],
    ]);
    expect(a1!.querySelector('a')).toBeNull();
    expect([...b2!.querySelectorAll('li')].map(parts)).toEqual([
      ['Høg', '4 av 9 veit ikkje kvar dei skal melde frå', 'I seminar'],
    ]);
    // One link per client and round, in the line of its heading; the round tells two apart.
    const links = [...card.querySelectorAll<HTMLAnchorElement>('.sem-funn-hovud a.lenkje')].map(
      (a) => [text(a), a.getAttribute('aria-label'), a.getAttribute('href')],
    );
    expect(links).toEqual([
      [
        'Endre status hos Syntetisk A',
        'Endre status hos Syntetisk A, Haust 2026',
        `/admin/clients/${A}?runde=${R2}`,
      ],
      [
        'Endre status hos Syntetisk B',
        'Endre status hos Syntetisk B, Haust 2026',
        `/admin/clients/${B}?runde=${R2}`,
      ],
    ]);
    // The texts come from the client's result, read as the client page reads it (one cache).
    expect(
      fetcher.mock.calls
        .map(([p]) => p)
        .filter((p) => p.includes('/dashboard?'))
        .sort(),
    ).toEqual([
      `/api/admin/dashboard?round=${R1}&client=${A}`,
      `/api/admin/dashboard?round=${R2}&client=${A}`,
      `/api/admin/dashboard?round=${R2}&client=${B}`,
    ]);
    // Nothing to change here: no editor, and nothing but reads leaves the page.
    expect(card.querySelector('select, button')).toBeNull();
    expect(fetcher.mock.calls.filter(([, i]) => i?.method && i.method !== 'GET')).toEqual([]);
    expect(findBokmal(card.textContent ?? '')).toEqual([]);
    // The link opens the client page in the app.
    act(() => {
      card.querySelector<HTMLAnchorElement>('a.lenkje')!.click();
    });
    expect(window.location.pathname + window.location.search).toBe(
      `/admin/clients/${A}?runde=${R2}`,
    );
  });
  it('a finding of all the clients of a round links to the result of the round', async () => {
    current = seminar([
      row('all-12', null, R2, 'tryggleik.f12', 'in_seminar', '2026-10-17T10:00:00.000Z'),
    ]);
    view = mount(<SeminarPage id={ID} />, true);
    await settle();
    await settle();
    expect(text(block().querySelector('h3'))).toBe('Alle kundar Haust 2026');
    expect(block().querySelector('a.lenkje')?.getAttribute('href')).toBe(
      `/admin/rounds/${R2}/resultat`,
    );
    expect(fetcher).toHaveBeenCalledWith(`/api/admin/dashboard?round=${R2}`, expect.anything());
  });
  it('a result that cannot be read is said in its group; the other groups show as usual', async () => {
    broken = `round=${R2}&client=${B}`;
    view = mount(<SeminarPage id={ID} />, true);
    await settle();
    await settle();
    const b2 = [...block().querySelectorAll('.sem-funn-gruppe')][2]!;
    expect(text(b2.querySelector('h3'))).toBe('Syntetisk B Haust 2026');
    expect(text(b2.querySelector('[role="alert"]'))).toBe('Resultatet kan ikkje lesast no.');
    expect(b2.querySelector('a, li')).toBeNull();
    expect(block().querySelectorAll('li')).toHaveLength(3);
  });
  it('no findings: one sentence, and the clients to choose them at, each opened at «Funn»', async () => {
    current = seminar([]);
    view = mount(<SeminarPage id={ID} />, true);
    await settle();
    expect(text(block().querySelector('.kort-innhald'))).toBe(
      'Ingen funn er knytte til seminaret. Vel «I seminar» for eit funn på sida til ein av kundane: Syntetisk A eller Syntetisk B.',
    );
    expect(
      [...block().querySelectorAll('a')].map((a) => [text(a), a.getAttribute('href')]),
    ).toEqual([
      ['Syntetisk A', `/admin/clients/${A}?funn`],
      ['Syntetisk B', `/admin/clients/${B}?funn`],
    ]);
    expect(text(block().querySelector('.kort-hovud'))).toBe('Funn seminaret tek opp');
    expect(findBokmal(block().textContent ?? '')).toEqual([]);
    // Nothing to show, nothing to read: no results, no lists of clients or rounds.
    expect(fetcher.mock.calls.map(([p]) => p)).toEqual([`/api/admin/seminars/${ID}`]);
    view.close();
    // One client: «kunden».
    current = seminar([], [{ id: A, name: 'Syntetisk A' }]);
    view = mount(<SeminarPage id={ID} />, true);
    await settle();
    expect(text(block().querySelector('.kort-innhald'))).toBe(
      'Ingen funn er knytte til seminaret. Vel «I seminar» for eit funn på sida til kunden: Syntetisk A.',
    );
  });
  it('no findings and no clients: the findings come from the clients', async () => {
    current = seminar([], []);
    view = mount(<SeminarPage id={ID} />, true);
    await settle();
    expect(text(block().querySelector('.kort-innhald'))).toBe(
      'Ingen funn er knytte til seminaret. Funna kjem frå kundane: legg til kundar med «Endre» først.',
    );
    expect(findBokmal(block().textContent ?? '')).toEqual([]);
  });
});

describe('heading and tab title', () => {
  it('the topic is the heading and the tab title, also when the seminar comes from cache', async () => {
    window.history.replaceState(null, '', '/admin/seminars');
    view = mount(<App />);
    await settle();
    expect(view.div.querySelector('h1')?.textContent).toBe('Seminar');
    expect(document.title).toBe('Seminar – Varde');
    const open = async () => {
      act(() => {
        view!.div.querySelector<HTMLAnchorElement>(`a[href="/admin/seminars/${ID}"]`)!.click();
      });
      await settle();
    };
    await open();
    expect([...view.div.querySelectorAll('h1')].map((h) => h.textContent)).toEqual([TOPIC]);
    expect(document.title).toBe(`${TOPIC} – Varde`);
    act(() => {
      view!.div.querySelector<HTMLAnchorElement>('a.sem-tilbake')!.click();
    });
    await settle();
    expect(document.title).toBe('Seminar – Varde');
    // The second visit renders from cache in the same commit as the new address.
    await open();
    expect(document.title).toBe(`${TOPIC} – Varde`);
  });
  it('a seminar that cannot be read keeps the heading and tab title of the section', async () => {
    current = null;
    document.title = 'Daco – Varde';
    view = mount(<SeminarPage id={ID} />, true);
    await settle();
    expect([...view.div.querySelectorAll('h1')].map((h) => h.textContent)).toEqual(['Seminar']);
    expect(text(view.div.querySelector('[role="alert"]'))).toBe('Seminaret finst ikkje.');
    expect(document.title).toBe('Seminar – Varde');
  });
});

describe('the client page from a seminar', () => {
  const choice = () =>
    view!.div.querySelector<HTMLSelectElement>('select[aria-label="Vis funn frå runde"]');
  const card = () => view!.div.querySelector('section[aria-labelledby="kunde-funn"]');
  /** Where the card is on the page as it opens: far down (a phone) or in sight (a desktop). */
  const at = (top: number) =>
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top,
      bottom: top + 900,
      left: 0,
      right: 400,
      x: 0,
      y: top,
      width: 400,
      height: 900,
    } as DOMRect);
  it('«?runde=» opens «Funn» on that round with the focus; without it the newest round with findings', async () => {
    at(1200);
    view = mount(<KundePage id={A} search={`?runde=${R1}`} />, true);
    await settle();
    await settle();
    expect(choice()?.value).toBe(R1);
    expect(view.div.textContent).toContain('1 av 5');
    // The page opens where the status is changed: far down on a phone, the card comes up, top first.
    expect(document.activeElement).toBe(card());
    expect(scrolled.mock.contexts).toEqual([card()]);
    expect(scrolled).toHaveBeenCalledWith({ block: 'start' });
    // Another round is the person's choice: the focus stays where they are.
    act(() => {
      choice()!.focus();
      Reflect.set(HTMLSelectElement.prototype, 'value', R2, choice());
      choice()!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    expect(view.div.textContent).toContain('2 av 6');
    expect(document.activeElement).toBe(choice());
    view.close();
    view = mount(<KundePage id={A} />, true);
    await settle();
    await settle();
    expect(choice()?.value).toBe(R2);
    expect(view.div.textContent).toContain('2 av 6');
    expect(card()?.hasAttribute('tabindex')).toBe(false);
    expect(document.activeElement).toBe(document.body);
    expect(scrolled).toHaveBeenCalledTimes(1);
  });
  it('the page moves only when the card is out of sight, below or above', async () => {
    for (const [top, moves] of [
      [120, false],
      [-300, true],
    ] as const) {
      scrolled.mockClear();
      const spy = at(top);
      view = mount(<KundePage id={A} search={`?runde=${R1}`} />, true);
      await settle();
      await settle();
      expect(choice()?.value).toBe(R1);
      // The card takes the focus either way.
      expect(document.activeElement).toBe(card());
      expect(scrolled).toHaveBeenCalledTimes(moves ? 1 : 0);
      view.close();
      view = undefined;
      spy.mockRestore();
    }
  });
  it('«?funn» (no findings yet) opens «Funn» on the newest round with findings, with the focus', async () => {
    at(1200);
    view = mount(<KundePage id={A} search="?funn" />, true);
    await settle();
    await settle();
    expect(choice()?.value).toBe(R2);
    expect(document.activeElement).toBe(card());
    expect(scrolled).toHaveBeenCalledTimes(1);
  });
  it('an old link to a round without answers opens the newest round, and takes no focus', async () => {
    at(1200);
    view = mount(<KundePage id={A} search="?runde=00000000-0000-4000-8000-0000000000ee" />, true);
    await settle();
    await settle();
    expect(choice()?.value).toBe(R2);
    expect(view.div.textContent).toContain('2 av 6');
    expect(document.activeElement).toBe(document.body);
    expect(scrolled).not.toHaveBeenCalled();
  });
  it('the focus stays where the person put it while the findings loaded (the search palette)', async () => {
    at(1200);
    const field = document.createElement('input');
    document.body.appendChild(field);
    view = mount(<KundePage id={A} search={`?runde=${R1}`} />, true);
    field.focus();
    await settle();
    await settle();
    expect(choice()?.value).toBe(R1);
    expect(document.activeElement).toBe(field);
    expect(scrolled).not.toHaveBeenCalled();
    field.remove();
  });
});
