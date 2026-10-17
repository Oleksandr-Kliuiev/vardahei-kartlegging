// 3.8 (unit, jsdom): the card «Rundar» of a seminar. Three steps — before, live, after — with the
// state of each round, the answers of the seminar's clients from the progress of the round and the
// links; «Før» is chosen from the offered rounds (a refusal of the server is shown as it is); «Start
// undersøking etter seminaret» opens the round wizard with the seminar's clients and sends the seminar.
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findBokmal } from '../../../packages/schema/src/i18n/nn-stoplist.js';
import { RoundsCard } from '../src/seminar-rounds.js';
import type { SeminarDetail } from '../src/seminar-models.js';
import type { SeminarRounds } from '../src/seminar-rounds-models.js';
import { button, mount, settle } from './support.js';

const ID = '00000000-0000-4000-8000-0000000000b1';
const seminar = {
  id: ID,
  topic_nn: 'Passord og MFA',
  clients: [
    { id: 'c-daco', name: 'Daco' },
    { id: 'c-gasta', name: 'Gasta' },
  ],
  registrations: { total: 4, companies: [] },
} as unknown as SeminarDetail;
const step = (id: string, name: string, status: string): NonNullable<SeminarRounds['before']> => ({
  id,
  name,
  type: id === 'r-etter' ? 'post_seminar' : 'regular',
  status,
  template: 'tryggleik · 2026-10-13',
  opened_at: '2026-10-01T08:00:00.000Z',
  closed_at: null,
  round_clients: [
    {
      id: `${id}-daco`,
      client_id: 'c-daco',
      name: 'Daco',
      status,
      population: 20,
      deadline: '2026-11-26',
    },
    {
      id: `${id}-gasta`,
      client_id: 'c-gasta',
      name: 'Gasta',
      status,
      population: 21,
      deadline: '2026-11-26',
    },
  ],
  others: 1,
});

let rounds: SeminarRounds;
let refuse: string | null = null;
let view: ReturnType<typeof mount> | undefined;
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const fetcher = vi.fn((path: string, init?: RequestInit) => {
  const method = init?.method ?? 'GET';
  if (path === `/api/admin/seminars/${ID}/rounds`) return json(rounds);
  if (path.endsWith('/progress'))
    return json({
      class: 'aggregate',
      clients: [
        { round_client_id: 'r-for-daco', responses_total: 12 },
        { round_client_id: 'r-for-gasta', responses_total: 11 },
      ],
    });
  if (path === `/api/admin/seminars/${ID}/live`)
    return json({
      poll: {
        questions: [
          { id: 'L1', no: 1, state: 'released', text: { nn: 'a' } },
          { id: 'L2', no: 2, state: 'waiting', text: { nn: 'b' } },
        ],
      },
      versions: [],
      presenter: {},
    });
  if (path.includes('/rounds/before') && method === 'PUT')
    return refuse ? json({ message: refuse }, 400) : json({ ok: true, changed: true });
  if (path === '/api/admin/clients')
    return json([
      { id: 'c-daco', name: 'Daco', slug: 'daco', employee_count: 20 },
      { id: 'c-gasta', name: 'Gasta', slug: 'gasta', employee_count: 21 },
      { id: 'c-kviknes', name: 'Kviknes', slug: 'kviknes', employee_count: 30 },
    ]);
  if (path === '/api/admin/rounds/launch')
    return json({ id: 'r-etter', round_client_ids: ['rc1', 'rc2'], status: 'draft' }, 201);
  return json({ ok: true });
});
beforeEach(() => {
  fetcher.mockClear();
  refuse = null;
  rounds = {
    before: null,
    live: { id: 'r-live', status: 'open' },
    after: null,
    choices: {
      before: [{ id: 'r-for', name: 'Runde 2 IT-tryggleik', status: 'open', shared: 2 }],
      after: [],
    },
    versions: [{ id: 'v1', label: '2026-10-13', template: { key: 'tryggleik' } }],
  };
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  view?.close();
  view = undefined;
  vi.unstubAllGlobals();
});
const text = (testid: string) =>
  view!.div.querySelector(`[data-testid="${testid}"]`)?.textContent ?? '';

describe('the card «Rundar»', () => {
  it('three steps: before, live and after with their state; nothing linked yet', async () => {
    view = mount(<RoundsCard seminar={seminar} onLive={() => {}} />, true);
    await settle();
    expect(text('steg-for')).toContain('Før seminaret');
    expect(text('steg-for')).toContain('Inga undersøking er kopla til');
    expect(text('steg-live')).toContain('1 av 2 spørsmål viste');
    expect(text('steg-live')).toContain('I gang');
    expect(text('steg-etter')).toContain('Inga undersøking enno');
    expect(text('steg-etter')).toContain('Start undersøking etter seminaret');
    expect(findBokmal(view.div.textContent ?? '')).toEqual([]);
  });

  it('a linked «Før»: name, state, answers of the seminar’s clients and the links', async () => {
    rounds = { ...rounds, before: step('r-for', 'Runde 2 IT-tryggleik', 'open') };
    view = mount(<RoundsCard seminar={seminar} onLive={() => {}} />, true);
    await settle();
    expect(text('steg-for')).toContain('Runde 2 IT-tryggleik');
    expect(text('steg-for')).toContain('Open');
    expect(text('svar-before')).toBe('23 svar av 41 · Daco 12 av 20 · Gasta 11 av 21');
    expect(text('steg-for')).toContain('Open til 26. november');
    expect(text('steg-for')).toContain('Open til 26. november');
    expect(text('steg-for')).toContain('Runden har òg éin kunde som ikkje er på seminaret.');
    const links = [...view.div.querySelectorAll('[data-testid="steg-for"] a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(links).toEqual(['/admin/rounds/r-for/resultat', '/admin/rounds/r-for']);
    expect(view.div.textContent).toContain('Ta bort koplinga');
  });

  it('«Før» is linked by choosing a round; a refusal of the server is shown as it is', async () => {
    view = mount(<RoundsCard seminar={seminar} onLive={() => {}} />, true);
    await settle();
    const select = view.div.querySelector<HTMLSelectElement>('[data-testid="steg-for"] select')!;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'Vel undersøking',
      'Runde 2 IT-tryggleik · open · 2 kundar på seminaret',
    ]);
    refuse = 'Ingen av kundane på seminaret er med i denne undersøkinga.';
    act(() => {
      select.value = 'r-for';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => button(view!.div, 'Kople til som «Før»').click());
    await settle();
    expect(view.div.querySelector('[role="alert"]')?.textContent).toBe(refuse);
    expect(fetcher).toHaveBeenCalledWith(
      `/api/admin/seminars/${ID}/rounds/before`,
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ round: 'r-for' }) }),
    );
  });

  it('«Start undersøking etter seminaret»: the wizard with the seminar’s clients, sent with the seminar', async () => {
    view = mount(<RoundsCard seminar={seminar} onLive={() => {}} />, true);
    await settle();
    act(() => button(view!.div, 'Start undersøking etter seminaret').click());
    await settle();
    const form = view.div.querySelector('form')!;
    expect(view.div.textContent).toContain('Undersøking etter seminaret');
    expect(view.div.textContent).toContain('Vel same skjema som undersøkinga før');
    expect([...form.querySelectorAll('.launch-client label')].map((l) => l.textContent)).toEqual([
      'Daco',
      'Frist for Daco',
      'Tilsette i runden for Daco',
      'Gasta',
      'Frist for Gasta',
      'Tilsette i runden for Gasta',
    ]);
    expect(form.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe(
      'Etter seminaret: Passord og MFA',
    );
    act(() => {
      const version = form.querySelector<HTMLSelectElement>('select[name="version"]')!;
      version.value = 'v1';
      for (const input of form.querySelectorAll<HTMLInputElement>('input[type="date"]'))
        input.value = '2099-12-01';
    });
    act(() => form.requestSubmit());
    await settle();
    const call = fetcher.mock.calls.find(([p]) => p === '/api/admin/rounds/launch')!;
    expect(JSON.parse(call[1]!.body as string)).toMatchObject({
      seminar: ID,
      template_version_id: 'v1',
      clients: [
        { client_id: 'c-daco', deadline: '2099-12-01', population_snapshot: 20 },
        { client_id: 'c-gasta', deadline: '2099-12-01', population_snapshot: 21 },
      ],
    });
    expect(findBokmal(view.div.textContent ?? '')).toEqual([]);
  });
});
