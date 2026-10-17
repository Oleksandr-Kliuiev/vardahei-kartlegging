// «I dag», the journal areas and «Hald fram» (2.17): what waits and in which order, what is left
// out, calendar days to a deadline, and the place in the workshop kept in this browser.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import { lastNode, placeName, sidan } from '../src/hald-fram.js';
import { IdagPage, todos } from '../src/idag-page.js';
import { areaOf } from '../src/logg.js';
import type { Progress, Round } from '../src/models.js';
import { daysTo } from '../src/overview.js';
import type { SurveySummary } from '../src/survey-models.js';
import { mount, settle } from './support.js';

const NOW = new Date('2026-10-17T15:00:00').getTime();
const day = (n: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T00:00:00.000Z`;
};
const rc = (id: string, name: string, deadline: string | null, extra: object = {}) => ({
  id,
  client_id: `c-${id}`,
  client: { name },
  status: 'open',
  deadline,
  population_snapshot: 10,
  ...extra,
});
const cell = { suppressed: true } as const;
const answered = (id: string, n: number): [string, Progress] => [
  id,
  {
    round_client_id: id,
    population_snapshot: 10,
    responses_total: n,
    last_response_day: null,
    in_progress: cell,
    abandoned: cell,
    started: cell,
    median_duration_s: cell,
    stopped: {},
  },
];
const rounds: Round[] = [
  {
    id: 'open',
    name: 'Haust',
    status: 'open',
    template_version_id: 'v',
    round_clients: [
      rc('far', 'Kviknes', day(12)),
      rc('soon', 'Gasta', day(2)),
      rc('late', 'Daco', day(-1)),
      rc('done', 'Tharaso', day(1)),
      rc('closed', 'SFHS', day(1), { status: 'closed' }),
    ],
  },
  {
    id: 'closed',
    name: 'Runde 2',
    status: 'closed',
    template_version_id: 'v',
    opened_at: new Date(NOW - 30 * 86_400_000).toISOString(),
    closed_at: new Date(NOW - 3 * 86_400_000).toISOString(),
    round_clients: [rc('r1', 'Daco', null, { status: 'closed', released: true })],
  },
  {
    id: 'old',
    name: 'Runde 1',
    status: 'closed',
    template_version_id: 'v',
    opened_at: new Date(NOW - 90 * 86_400_000).toISOString(),
    closed_at: new Date(NOW - 40 * 86_400_000).toISOString(),
    round_clients: [rc('r2', 'Daco', null, { status: 'closed', released: true })],
  },
  {
    // Imported history: closed by the import, never opened in Varde.
    id: 'import',
    name: 'Forms',
    type: 'regular',
    status: 'closed',
    template_version_id: 'v',
    closed_at: new Date(NOW - 1 * 86_400_000).toISOString(),
    round_clients: [rc('r3', 'Daco', null, { status: 'closed', released: true })],
  },
  { id: 'new', name: 'Vår', status: 'draft', template_version_id: 'v', round_clients: [] },
];
const surveys = [
  { id: 's', key: 'tryggleik', title: 'IT-sikkerheit', draft: { id: 'd', version_no: 3, left: 2 } },
  { id: 't', key: 'ki', title: 'KI', draft: null },
] as unknown as SurveySummary[];

describe('«I dag»', () => {
  it('lists overdue and close deadlines first, then reports, drafts, rounds not opened and contacts', () => {
    const items = todos({
      rounds,
      progress: new Map([answered('soon', 6), answered('late', 3), answered('done', 10)]),
      surveys,
      contacts: 2,
      reminder: null,
      now: NOW,
    });
    expect(items.map((t) => t.title)).toEqual([
      'Daco: fristen gjekk ut for 1 dag sidan',
      'Gasta: fristen er om 2 dagar',
      'Rapporten til Daco er klar',
      'Utkast v3 av «IT-sikkerheit»',
      '«Vår» er ikkje opna enno',
      '2 kontaktar ventar på den årlege sjekken',
    ]);
    expect(items[0]!.text).toBe('3 av 10 har svart. Steng for svar eller flytt fristen.');
    expect(items[1]!.text).toBe('6 av 10 har svart. Hent påminning og send ho til leiaren.');
    expect(items[1]!.to).toBe('/admin/rounds/open/utsending?kunde=soon');
    expect(items[2]!.to).toBe('/admin/rounds/closed/rapportar/r1');
    expect(items[3]!.text).toBe('2 ting att før publisering.');
  });
  it('a report marked as sent leaves the list; a reminder marked as sent is named (2.18)', () => {
    const sent = rounds.map((r) => ({
      ...r,
      round_clients: r.round_clients.map((rc) =>
        rc.id === 'r1'
          ? { ...rc, report_sent_at: new Date(NOW).toISOString() }
          : rc.id === 'soon'
            ? { ...rc, reminder_sent_at: new Date(NOW - 86_400_000).toISOString() }
            : rc,
      ),
    }));
    const items = todos({
      rounds: sent,
      progress: new Map([answered('soon', 6), answered('late', 3)]),
      surveys: [],
      contacts: 0,
      reminder: null,
      now: NOW,
    });
    expect(items.map((t) => t.title)).not.toContain('Rapporten til Daco er klar');
    expect(items.find((t) => t.key === 'frist:soon')!.text).toBe(
      '6 av 10 har svart. Påminning sendt 16. oktober.',
    );
  });
  it('an archive deadline comes first and has no link: the deletion is done outside Varde', () => {
    const [first] = todos({
      rounds: [],
      progress: new Map(),
      surveys: [],
      contacts: 0,
      reminder: { delete_by: '2026-12-31', overdue: true },
      now: NOW,
    });
    expect(first).toMatchObject({ title: 'Arkivet frå kartlegging', tone: 'warn' });
    expect(first!.to).toBeUndefined();
    expect(first!.text).toContain('Fristen har gått ut. Slett arkivet seinast 2026-12-31.');
  });
  it('counts calendar days, so late in the evening tomorrow is still «i morgon»', () => {
    const evening = new Date('2026-10-17T23:30:00').getTime();
    expect(daysTo('2026-10-18T00:00:00.000Z', evening)).toBe(1);
    expect(daysTo('2026-10-17', evening)).toBe(0);
    expect(daysTo('2026-10-16', evening)).toBe(-1);
    expect(daysTo(null, evening)).toBeNull();
  });
  it('renders the list with links, and nothing waits says so', async () => {
    const fetcher = vi.fn((path: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            path === '/api/admin/rounds'
              ? rounds
              : path === '/api/admin/surveys'
                ? surveys
                : path === '/api/admin/seminars'
                  ? { seminars: [], contacts_to_review: 1 }
                  : path.endsWith('/progress')
                    ? { clients: [answered('soon', 6)[1]] }
                    : null,
          ),
        ),
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    const view = mount(<IdagPage />, true);
    await settle();
    await settle();
    const links = [...view.div.querySelectorAll<HTMLAnchorElement>('a.ting')].map((a) =>
      a.getAttribute('href'),
    );
    expect(links).toContain('/admin/personvern/kontaktar');
    expect(links).toContain('/admin/surveys/d');
    expect(view.div.querySelector('.idag-runde h2')?.textContent).toBe('Haust');
    expect(view.div.textContent).toContain('Dette ventar på deg.');
    view.close();
    vi.unstubAllGlobals();
  });
});

describe('the journal', () => {
  it('sorts entries into areas by what happened', () => {
    expect(areaOf('rounds.client.open')).toBe('rundar');
    expect(areaOf('clients.update')).toBe('rundar');
    expect(areaOf('surveys.publish')).toBe('skjema');
    expect(areaOf('settings.update')).toBe('skjema');
    expect(areaOf('seminars.invitation')).toBe('seminar');
    expect(areaOf('privacy.rows')).toBe('personvern');
    expect(areaOf('retention.forget')).toBe('personvern');
    expect(areaOf('leader.read')).toBe('personvern');
  });
});

describe('«Hald fram»', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  const content = { questions: [{ id: 'F5' }] } as unknown as TemplateContent;
  it('starts the same version on the node left last time, if it is still there', () => {
    store.set('varde:hald-fram', JSON.stringify({ id: 'v1', title: 'IT', node: 'F5', at: '' }));
    expect(lastNode('v1', content)).toBe('F5');
    expect(lastNode('v2', content)).toBeNull();
    store.set('varde:hald-fram', JSON.stringify({ id: 'v1', title: 'IT', node: 'F9', at: '' }));
    expect(lastNode('v1', content)).toBeNull();
    store.set('varde:hald-fram', JSON.stringify({ id: 'v1', title: 'IT', node: ':slutt', at: '' }));
    expect(lastNode('v1', content)).toBe(':slutt');
    store.set('varde:hald-fram', '{not json');
    expect(lastNode('v1', content)).toBeNull();
  });
  it('names the place and the time in words', () => {
    expect(placeName('F5')).toBe('F5');
    expect(placeName(':velkomen')).toBe('velkomsten');
    expect(placeName(':seksjon:2')).toBe('ein seksjon');
    const at = new Date(NOW - 4 * 60_000).toISOString();
    expect(sidan(at, NOW)).toBe('for 4 minutt sidan');
    expect(sidan(new Date(NOW - 2 * 3_600_000).toISOString(), NOW)).toBe('for 2 timar sidan');
    expect(sidan(new Date(NOW - 26 * 3_600_000).toISOString(), NOW)).toBe('i går');
    expect(sidan(new Date(NOW - 5 * 86_400_000).toISOString(), NOW)).toBe('for 5 dagar sidan');
  });
});
