// The client page (2.17): the contacts load only on request and leave with «Skjul»; the findings
// open on the newest round that has any, each with its follow-up — open, taken up at a seminar
// (with a link to it) or done — and a change goes to the saved finding; an open round has no
// follow-up yet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { KundePage } from '../src/kunde-page.js';
import { statusBody, type FindingFollowUp } from '../src/kunde-funn.js';
import { button, mount, settle } from './support.js';

const C = 'c1';
const seminar = {
  id: 's1',
  topic_nn: 'Phishing og falske fakturaer',
  topic_en: null,
  starts_at: '2026-11-12T08:00:00.000Z',
  ends_at: '2026-11-12T10:00:00.000Z',
  clients: [{ id: C, name: 'Daco' }],
  status: 'planned',
  registrations: { total: 2, companies: [{ company: 'Daco', n: 2 }], other: 0 },
};
const rc = {
  id: 'rc',
  client_id: C,
  client: { name: 'Daco' },
  status: 'closed',
  deadline: null,
  population_snapshot: 10,
};
const round = (id: string, name: string, status = 'closed') => ({
  id,
  name,
  status,
  template_version_id: 'v',
  has_data: true,
  closed_at: status === 'closed' ? '2026-10-16T10:00:00.000Z' : null,
  round_clients: [{ ...rc, id: `rc-${id}`, status }],
});
const finding = (key: string, tal: string, text: string) => ({
  key,
  n: 10,
  count: 4,
  share: 0.4,
  level: 'high',
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
const follow: FindingFollowUp[] = [
  {
    id: 'f-12',
    round: 'r2',
    rule_key: 'tryggleik.f12',
    status: 'in_seminar',
    seminar: { id: 's1', topic: seminar.topic_nn, starts_at: seminar.starts_at },
    changed_by: 'Syntetisk admin',
    changed_at: '2026-10-17T12:00:00.000Z',
  },
  {
    id: 'f-14',
    round: 'r2',
    rule_key: 'tryggleik.f14',
    status: 'open',
    seminar: null,
    changed_by: null,
    changed_at: null,
  },
];
let extra: FindingFollowUp[] = [];
let rounds = [round('ki', 'KI 2026-10-12'), round('r2', 'Runde 2')];
let counted = { total: 2, review: 1 };
const fetcher = vi.fn((path: string, init?: RequestInit) => {
  void init;
  const body =
    path === '/api/admin/clients'
      ? [{ id: C, name: 'Daco', slug: 'daco', employee_count: 25 }]
      : path === '/api/admin/rounds'
        ? rounds
        : path === '/api/admin/seminars'
          ? { seminars: [seminar], contacts_to_review: 1 }
          : path.startsWith('/api/admin/dashboard?round=ki')
            ? dashboard([])
            : path.startsWith('/api/admin/dashboard?round=')
              ? dashboard([
                  finding('tryggleik.f12', '4 av 10', 'veit ikkje kvar dei skal melde frå'),
                  finding('tryggleik.f14', '3 av 10', 'brukar ikkje MFA'),
                ])
              : path === `/api/admin/clients/${C}/contacts/count`
                ? counted
                : path === `/api/admin/clients/${C}/contacts`
                  ? {
                      rows: [
                        {
                          id: 'k1',
                          name: 'ZZ Kari Syntetisk',
                          email: 'kari@example.test',
                          role: 'dagleg leiar',
                          invite: true,
                          last_confirmed_at: '2026-10-16T10:00:00.000Z',
                          review: false,
                          seminars: [
                            { id: 's1', topic: seminar.topic_nn, starts_at: seminar.starts_at },
                          ],
                        },
                        {
                          id: 'k2',
                          name: 'ZZ Ola Syntetisk',
                          email: 'ola@example.test',
                          role: null,
                          invite: false,
                          last_confirmed_at: '2025-09-01T10:00:00.000Z',
                          review: true,
                          seminars: [],
                        },
                      ],
                    }
                  : path === `/api/admin/clients/${C}/finding-status`
                    ? { rows: [...follow, ...extra] }
                    : { ok: true };
  return Promise.resolve(new Response(JSON.stringify(body)));
});
let view: ReturnType<typeof mount> | undefined;
beforeEach(() => {
  fetcher.mockClear();
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  view?.close();
  view = undefined;
  vi.unstubAllGlobals();
  rounds = [round('ki', 'KI 2026-10-12'), round('r2', 'Runde 2')];
  counted = { total: 2, review: 1 };
  extra = [];
});
const calls = (match: string) => fetcher.mock.calls.filter(([p]) => p === match);
const region = (name: string) =>
  [...view!.div.querySelectorAll('section')].find(
    (s) => s.querySelector('h2')?.textContent === name,
  )!;
const choose = (select: HTMLSelectElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
async function open() {
  view = mount(<KundePage id={C} />, true);
  for (let i = 0; i < 4; i++) await settle();
}

describe('the client page: contacts (2.17)', () => {
  it('shows how many first; names and e-mail only on request, once, never in the query cache', async () => {
    await open();
    const card = region('Kontaktar');
    expect(card.textContent).toContain('2 kontaktar hos Daco.');
    const check = card.querySelector<HTMLAnchorElement>('a[href="/admin/personvern/kontaktar"]');
    expect(check?.textContent).toBe('1 ventar på den årlege sjekken');
    expect(card.textContent).not.toContain('ZZ Kari');
    expect(calls(`/api/admin/clients/${C}/contacts/count`)).toHaveLength(1);
    expect(calls(`/api/admin/clients/${C}/contacts`)).toHaveLength(0);
    // One button that stays: the focus stays on it when the list opens and closes.
    const toggle = button(card, 'Vis kontaktane');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.focus();
    act(() => {
      toggle.click();
    });
    await settle();
    await settle();
    expect(calls(`/api/admin/clients/${C}/contacts`)).toHaveLength(1);
    expect(toggle.textContent).toBe('Skjul kontaktane');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe('kunde-kontaktliste');
    expect(document.activeElement).toBe(toggle);
    const items = [...card.querySelectorAll('#kunde-kontaktliste li')].map((li) => li.textContent);
    expect(items).toEqual([
      'ZZ Kari Syntetiskkari@example.test · dagleg leiar · invitasjonar: ja · sist sjekka 16.10.2026Påmeld: Phishing og falske fakturaer (12.11.2026)',
      'ZZ Ola SyntetiskÅrleg sjekkola@example.test · invitasjonar: nei · sist sjekka 01.09.2025',
    ]);
    expect(card.querySelector('a[href="mailto:kari@example.test"]')).not.toBeNull();
    expect(card.querySelector('.kontakt-liste a[href="/admin/seminars/s1"]')).not.toBeNull();
    const cached = JSON.stringify(
      view!.client
        .getQueryCache()
        .getAll()
        .map((q) => q.state.data),
    );
    expect(cached).not.toContain('ZZ Kari');
    expect(cached).not.toContain('kari@example.test');
    act(() => {
      toggle.click();
    });
    await settle();
    expect(card.textContent).not.toContain('ZZ Kari');
    expect(toggle.textContent).toBe('Vis kontaktane');
    expect(document.activeElement).toBe(toggle);
  });

  it('a new count (a registration, a deletion) takes the names off the screen', async () => {
    await open();
    const card = region('Kontaktar');
    act(() => {
      button(card, 'Vis kontaktane').click();
    });
    await settle();
    await settle();
    expect(card.textContent).toContain('ZZ Ola');
    counted = { total: 1, review: 0 };
    await act(async () => {
      await view!.client.invalidateQueries({ queryKey: ['seminars'] });
    });
    await settle();
    expect(card.textContent).toContain('1 kontakt hos Daco.');
    expect(card.textContent).not.toContain('ZZ Ola');
    expect(button(card, 'Vis kontaktane').getAttribute('aria-expanded')).toBe('false');
    expect(calls(`/api/admin/clients/${C}/contacts`)).toHaveLength(1);
  });
});

describe('the client page: follow-up of the findings (2.17)', () => {
  it('opens on the newest round with findings; each finding has its status and the seminar link', async () => {
    await open();
    const card = region('Funn');
    const select = card.querySelector<HTMLSelectElement>(
      'select[aria-label="Vis funn frå runde"]',
    )!;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'KI 2026-10-12 · ingen funn',
      'Runde 2 · 2 funn',
    ]);
    expect(select.value).toBe('r2');
    const items = [...card.querySelectorAll<HTMLElement>('.funn li')];
    expect(items.map((li) => li.querySelector('.chip')?.textContent)).toEqual([
      'I seminar',
      'Open',
    ]);
    const link = items[0]!.querySelector<HTMLAnchorElement>('.oppfolging a')!;
    expect(link.getAttribute('href')).toBe('/admin/seminars/s1');
    expect(link.textContent).toBe('Phishing og falske fakturaer · 12.11.2026');
    expect(items[0]!.textContent).toContain('Endra av Syntetisk admin 17.10.2026');
    expect(items[1]!.textContent).not.toContain('Endra av');
    choose(select, 'ki');
    expect(card.textContent).toContain('Ingen tydelege funn i denne runden.');
  });

  it('a change goes to the saved finding; the choice lists the client’s seminars', async () => {
    await open();
    const item = [...region('Funn').querySelectorAll<HTMLElement>('.funn li')][1]!;
    expect(
      item.querySelector('button[aria-label="Endre status for funnet: 3 av 10 brukar ikkje MFA"]'),
    ).not.toBeNull();
    act(() => {
      button(item, 'Endre status').click();
    });
    await settle();
    const select = item.querySelector<HTMLSelectElement>('select')!;
    expect(select.getAttribute('aria-label')).toBe('Status for funnet: 3 av 10 brukar ikkje MFA');
    expect(document.activeElement).toBe(select);
    expect(item.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(
      'Ny status for funnet: 3 av 10 brukar ikkje MFA',
    );
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'Open',
      'I seminar: Phishing og falske fakturaer (12.11.2026)',
      'Ferdig',
    ]);
    expect(button(item, 'Lagre').disabled).toBe(true);
    choose(select, 'seminar:s1');
    // New answers anywhere read every result again: the open editor and its choice stay.
    await act(async () => {
      await view!.client.invalidateQueries({ queryKey: ['responses'] });
    });
    await settle();
    expect(item.querySelector('select')).toBe(select);
    expect(select.value).toBe('seminar:s1');
    act(() => {
      button(item, 'Lagre').click();
    });
    await settle();
    await settle();
    const put = fetcher.mock.calls.find(
      ([p, i]) => p === '/api/admin/findings/f-14/status' && i?.method === 'PUT',
    );
    expect(JSON.parse(put![1]!.body as string)).toEqual({ status: 'in_seminar', seminar: 's1' });
    // Saved: the editor closes and the focus is back on «Endre status».
    expect(item.querySelector('select')).toBeNull();
    expect(document.activeElement).toBe(button(item, 'Endre status'));
  });

  it('a finding the new release no longer has keeps its status and its own editor', async () => {
    extra = [
      {
        id: 'f-5',
        round: 'r2',
        rule_key: 'tryggleik.f5',
        status: 'in_seminar',
        seminar: { id: 's1', topic: seminar.topic_nn, starts_at: seminar.starts_at },
        changed_by: 'Syntetisk admin',
        changed_at: '2026-10-17T12:00:00.000Z',
        dropped: { text: 'kjenner ingen rutine for å stoppe ei IT-hending' },
      },
      {
        id: 'f-x',
        round: 'ki',
        rule_key: 'ki.f1',
        status: 'in_seminar',
        seminar: null,
        changed_by: null,
        changed_at: null,
        dropped: { text: 'ein annan runde' },
      },
    ];
    await open();
    const card = region('Funn');
    // The current findings are as before; the dropped one is apart, under its own heading.
    expect(card.querySelectorAll('.funn li')).toHaveLength(2);
    const gone = card.querySelector<HTMLElement>('.kunde-funn-utfalne')!;
    expect(gone.querySelector('h3')?.textContent).toBe('Ikkje lenger med i resultatet');
    const items = [...gone.querySelectorAll<HTMLElement>('li')];
    expect(items).toHaveLength(1);
    expect(items[0]!.textContent).toContain('kjenner ingen rutine for å stoppe ei IT-hending');
    expect(items[0]!.querySelector('.chip')?.textContent).toBe('I seminar');
    act(() => {
      button(items[0]!, 'Endre status').click();
    });
    await settle();
    choose(items[0]!.querySelector<HTMLSelectElement>('select')!, 'closed');
    act(() => {
      button(items[0]!, 'Lagre').click();
    });
    await settle();
    await settle();
    const put = fetcher.mock.calls.find(
      ([p, i]) => p === '/api/admin/findings/f-5/status' && i?.method === 'PUT',
    );
    expect(JSON.parse(put![1]!.body as string)).toEqual({ status: 'closed', seminar: 's1' });
  });

  it('«Avbryt» closes the editor and gives the focus back to «Endre status»', async () => {
    await open();
    const item = [...region('Funn').querySelectorAll<HTMLElement>('.funn li')][0]!;
    act(() => {
      button(item, 'Endre status').click();
    });
    await settle();
    expect(item.querySelector<HTMLSelectElement>('select')!.value).toBe('seminar:s1');
    act(() => {
      button(item, 'Avbryt').click();
    });
    await settle();
    expect(item.querySelector('select')).toBeNull();
    expect(document.activeElement).toBe(button(item, 'Endre status'));
    expect(fetcher.mock.calls.some(([, i]) => i?.method === 'PUT')).toBe(false);
  });

  it('an open round has no follow-up yet and asks for none', async () => {
    rounds = [round('r2', 'Runde 2', 'open')];
    await open();
    const card = region('Funn');
    expect(card.textContent).toContain(
      'Runden er open. Status på funna kan du setje når runden er avslutta.',
    );
    expect(card.querySelectorAll('.oppfolging')).toHaveLength(0);
    expect(card.querySelector('select')).toBeNull();
    expect(card.textContent).toContain('Runde 2');
    expect(calls(`/api/admin/clients/${C}/finding-status`)).toHaveLength(0);
  });

  it('done keeps the seminar the finding was taken up at; open drops it', () => {
    expect(statusBody('closed', follow[0]!)).toEqual({ status: 'closed', seminar: 's1' });
    expect(statusBody('closed', follow[1]!)).toEqual({ status: 'closed' });
    expect(statusBody('open', follow[0]!)).toEqual({ status: 'open' });
    expect(statusBody('seminar:s2', follow[1]!)).toEqual({ status: 'in_seminar', seminar: 's2' });
  });
});
