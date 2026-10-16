// 3.4/3.5 (unit, jsdom): the seminar's «Live» tab. Without a poll it offers the versions made for
// live questions (and says why the others cannot); with a poll the question card shows «Ope →
// Stengt → Vist», «N har svart» while open and the result only after «Vis», with the buttons of the
// state; the presenter key is shown once as a link and revoked in two presses.
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Live } from '../src/seminar-live.js';
import type { LivePanel, LiveSnapshot } from '../src/seminar-live-models.js';
import type { SeminarDetail } from '../src/seminar-models.js';
import { button, mount, settle } from './support.js';

const ID = '00000000-0000-4000-8000-0000000000a1';
const seminar = {
  id: ID,
  topic_nn: 'Passord og MFA',
  registrations: { total: 18, companies: [] },
} as unknown as SeminarDetail;
const q = (no: number, state: LiveSnapshot['questions'][number]['state']) => ({
  id: `L${no}`,
  no,
  state,
  text: { nn: `Spørsmål nummer ${no}` },
});
const poll = (over: Partial<LiveSnapshot> = {}): LiveSnapshot => ({
  round: 'r1',
  seminar: { id: ID, topic: { nn: 'Passord og MFA' }, when: '' },
  languages: ['nn'],
  link: 'https://varde.test/r?c=Abcdefghijklmnopqrstuv',
  qr: null,
  total: 2,
  questions: [q(1, 'open'), q(2, 'waiting')],
  current: {
    ...q(1, 'open'),
    multi: false,
    options: [
      { id: 'ja', text: { nn: 'Ja' } },
      { id: 'nei', text: { nn: 'Nei' } },
    ],
    answered: { class: 'aggregate', suppressed: false, n: 7 },
    result: null,
  },
  at: '2026-11-05T09:00:00.000Z',
  ...over,
});
const presenter = (active = false): LivePanel['presenter'] => ({
  valid_from: '2026-11-03T23:00:00.000Z',
  valid_to: '2026-11-06T23:00:00.000Z',
  valid_text: 'frå onsdag 4. november 2026 til og med fredag 6. november 2026',
  valid_now: true,
  active: active ? { issued_at: '2026-10-16T12:03:00.000Z', issued_by: 'entra:x' } : null,
});

let panel: LivePanel;
let view: ReturnType<typeof mount> | undefined;
const fetcher = vi.fn((path: string, init?: RequestInit) => {
  const method = init?.method ?? 'GET';
  if (path.endsWith('/live') && method === 'GET')
    return Promise.resolve(new Response(JSON.stringify(panel)));
  if (path.endsWith('/presenter') && method === 'POST')
    return Promise.resolve(
      new Response(
        JSON.stringify({
          link: `https://varde.test/p#t=${'K'.repeat(43)}`,
          valid_text: panel.presenter.valid_text,
        }),
        { status: 201 },
      ),
    );
  if (path.includes('/live/questions/'))
    return Promise.resolve(
      new Response(JSON.stringify(poll({ questions: [q(1, 'closed'), q(2, 'waiting')] }))),
    );
  return Promise.resolve(new Response(JSON.stringify({ ok: true })));
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
const posts = () =>
  fetcher.mock.calls
    .filter(([, init]) => init?.method && init.method !== 'GET')
    .map(([p, init]) => `${init!.method} ${p}`);

describe('Live tab', () => {
  it('no poll yet: the usable versions, and why the others cannot be used', async () => {
    panel = {
      poll: null,
      presenter: presenter(),
      versions: [
        { id: 'v1', key: 'seminar-live', label: 'v1', questions: 3, problem: null },
        {
          id: 'v2',
          key: 'gammal',
          label: 'v1',
          questions: 2,
          problem: 'Spørsmål T1 har ikkje svaralternativ.',
        },
      ],
    };
    view = mount(<Live seminar={seminar} />, true);
    await settle();
    expect(view.div.querySelector('select')?.value).toBe('v1');
    expect(view.div.textContent).toContain('Spørsmål T1 har ikkje svaralternativ.');
    act(() => button(view!.div, 'Lag live-spørsmål').click());
    await settle();
    expect(fetcher).toHaveBeenCalledWith(
      `/api/admin/seminars/${ID}/live`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ template_version_id: 'v1' }),
      }),
    );
  });

  it('an open question: the chain, «N har svart», no numbers of the answers, «Steng spørsmålet»', async () => {
    panel = { poll: poll(), presenter: presenter(), versions: [] };
    view = mount(<Live seminar={seminar} />, true);
    await settle();
    const chain = view.div.querySelector('.tilstand-stig')!;
    expect([...chain.querySelectorAll('span')].map((s) => s.textContent)).toEqual([
      'Ope',
      'Stengt',
      'Vist',
    ]);
    expect(chain.querySelector('.no')?.textContent).toBe('Ope');
    expect(view.div.querySelector('[data-testid="har-svart"]')?.textContent).toBe(
      '7 har svart · 18 påmelde',
    );
    expect(view.div.querySelector('.poll')).toBeNull();
    act(() => button(view!.div, 'Steng spørsmålet').click());
    await settle();
    expect(posts()).toEqual([`POST /api/admin/seminars/${ID}/live/questions/L1/close`]);
    expect(view.div.querySelector('.tilstand-stig .no')?.textContent).toBe('Stengt');
  });

  it('below three answers: «Færre enn tre har svart», no number', async () => {
    const few = poll();
    panel = {
      poll: {
        ...few,
        current: { ...few.current!, answered: { class: 'aggregate', suppressed: true } },
      },
      presenter: presenter(),
      versions: [],
    };
    view = mount(<Live seminar={seminar} />, true);
    await settle();
    expect(view.div.querySelector('[data-testid="har-svart"]')?.textContent).toBe(
      'Færre enn tre har svart · 18 påmelde',
    );
  });

  it('a shown result: bars with shares; below k «For få svar til å vise tal»', async () => {
    const shown = poll({
      questions: [q(1, 'released'), q(2, 'waiting')],
      current: {
        ...poll().current!,
        state: 'released',
        result: {
          class: 'aggregate',
          suppressed: false,
          n: 4,
          options: [
            { id: 'ja', count: 3, share: 0.75 },
            { id: 'nei', count: 1, share: 0.25 },
          ],
        },
      },
    });
    panel = { poll: shown, presenter: presenter(), versions: [] };
    view = mount(<Live seminar={seminar} />, true);
    await settle();
    expect([...view.div.querySelectorAll('.poll-rad b')].map((b) => b.textContent)).toEqual([
      '75 %',
      '25 %',
    ]);
    expect(view.div.textContent).toContain('Opne neste spørsmål');
    view.close();
    panel = {
      poll: {
        ...shown,
        current: { ...shown.current!, result: { class: 'aggregate', suppressed: true } },
      },
      presenter: presenter(),
      versions: [],
    };
    view = mount(<Live seminar={seminar} />, true);
    await settle();
    expect(view.div.textContent).toContain('For få svar til å vise tal');
    expect(view.div.querySelector('.poll')).toBeNull();
  });

  it('the presenter link is shown once; revoking takes two presses', async () => {
    panel = { poll: poll(), presenter: presenter(), versions: [] };
    view = mount(<Live seminar={seminar} />, true);
    await settle();
    expect(view.div.textContent).toContain(
      'frå onsdag 4. november 2026 til og med fredag 6. november 2026',
    );
    act(() => button(view!.div, 'Lag lenkje til storskjermen').click());
    await settle();
    expect(view.div.querySelector('[data-testid="storskjerm-lenkje"]')?.textContent).toBe(
      `https://varde.test/p#t=${'K'.repeat(43)}`,
    );
    expect(view.div.textContent).toContain('Lenkja blir vist berre no.');
    panel = { ...panel, presenter: presenter(true) };
    act(() => button(view!.div, 'Trekk tilbake').click());
    expect(posts()).toEqual([`POST /api/admin/seminars/${ID}/presenter`]);
    act(() => button(view!.div, 'Stadfest: trekk tilbake').click());
    await settle();
    expect(posts()).toContain(`DELETE /api/admin/seminars/${ID}/presenter`);
    expect(view.div.querySelector('[data-testid="storskjerm-lenkje"]')).toBeNull();
  });
});
