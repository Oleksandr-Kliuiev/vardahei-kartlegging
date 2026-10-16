// 3.9 (unit, jsdom): the tab «Før og etter». The caveats are always on the screen (also before
// the rounds are chosen); bars before (grey) and after (blue) with both shares; a hidden side shows
// «–» and no bar; a question or metric that cannot be compared says why, without numbers; the score
// line and the table per client; the client filter asks the server again.
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findBokmal } from '../../../packages/schema/src/i18n/nn-stoplist.js';
import { BeforeAfterTab } from '../src/seminar-before-after.js';
import type { SeminarDetail } from '../src/seminar-models.js';
import type { BeforeAfter, QuestionPair } from '../src/seminar-rounds-models.js';
import { button, mount, settle } from './support.js';

const ID = '00000000-0000-4000-8000-0000000000c1';
const seminar = {
  id: ID,
  topic_nn: 'Passord og MFA',
  clients: [
    { id: 'c-daco', name: 'Daco' },
    { id: 'c-gasta', name: 'Gasta' },
  ],
  registrations: { total: 0, companies: [] },
} as unknown as SeminarDetail;
const CAVEATS = [
  'Det er ikkje nødvendigvis dei same personane som svarte før og etter, og heller ikkje like mange.',
  'Dei som vel å svare, kan skilje seg frå dei som ikkje svarar (sjølvval).',
  'Vi samanliknar berre spørsmål som er med i begge undersøkingane og blir rekna ut på same måten.',
  'Vi ser endringa, men kan ikkje seie at seminaret gjorde det.',
];
const options = [
  { id: 'ja', label: 'Ja' },
  { id: 'nei', label: 'Nei' },
];
const q = (over: Partial<QuestionPair>): QuestionPair => ({
  id: 'F12',
  label: 'Veit kor dei skal melde frå',
  text: 'Veit du kven du skal melde frå til?',
  multi: false,
  comparable: {
    degree: 'comparable',
    note: 'Same spørsmål og same utrekning i begge undersøkingane.',
  },
  options,
  before: { n: 7, shares: [0.4, 0.6] },
  after: { n: 5, shares: [0.8, 0.2] },
  score: null,
  ...over,
});
const side = (respondents: number | null, mean: number | null, critical: number | null) => ({
  respondents,
  mean,
  critical,
});
const ready = (questions: QuestionPair[]): BeforeAfter => ({
  class: 'aggregate',
  caveats: CAVEATS,
  ready: true,
  rounds: {
    before: { id: 'r1', name: 'Runde 2', status: 'closed', source: 'released' },
    after: { id: 'r2', name: 'Etter seminaret', status: 'open', source: 'live' },
  },
  client: null,
  cohort: [
    { slug: 'daco', name: 'Daco' },
    { slug: 'gasta', name: 'Gasta' },
  ],
  not_both: [{ name: 'Kviknes', before: true, after: false }],
  total: {
    comparable: {
      degree: 'comparable',
      note: 'Same spørsmål og same utrekning i begge undersøkingane.',
    },
    before: side(7, 0.86, 0.21),
    after: side(5, 0.1, 0),
    change: { delta: -0.76, kind: 'betre' },
    critical_change: { delta: -21, kind: 'betre' },
  },
  clients: [
    {
      slug: 'daco',
      name: 'Daco',
      before: side(4, 0.63, 0.25),
      after: side(null, null, null),
      change: null,
      critical_change: null,
    },
  ],
  questions,
  only_before: [],
  only_after: ['Kva lærte du?'],
});

let body: BeforeAfter;
let view: ReturnType<typeof mount> | undefined;
const json = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b)));
const fetcher = vi.fn((path: string) => {
  if (path.includes('/before-after')) return json(body);
  if (path.endsWith('/rounds'))
    return json({
      before: null,
      live: null,
      after: null,
      choices: { before: [], after: [] },
      versions: [],
    });
  if (path.endsWith('/live')) return json({ poll: null, versions: [], presenter: {} });
  return json({ ok: true });
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
const tab = async () => {
  view = mount(<BeforeAfterTab seminar={seminar} onLive={() => {}} />, true);
  await settle();
  return view.div;
};

describe('«Før og etter»', () => {
  it('before both rounds are chosen: the caveats and what to do, no numbers', async () => {
    body = {
      class: 'aggregate',
      caveats: CAVEATS,
      ready: false,
      missing: { before: true, after: true },
    };
    const div = await tab();
    expect([...div.querySelectorAll('.sem-atterhald li')].map((li) => li.textContent)).toEqual(
      CAVEATS,
    );
    expect(div.querySelector('[data-testid="fe-ikkje-klar"]')?.textContent).toContain(
      'under «Rundar»',
    );
    expect(div.querySelector('.poll')).toBeNull();
    expect(div.querySelector('#rundar-tittel')?.textContent).toBe('Rundar');
    view!.close();
    body = {
      class: 'aggregate',
      caveats: CAVEATS,
      ready: false,
      missing: { before: false, after: true },
    };
    const again = await tab();
    expect(again.querySelector('[data-testid="fe-ikkje-klar"]')?.textContent).toBe(
      'Start eller vel ei undersøking etter seminaret under «Rundar», så kjem samanlikninga her.',
    );
  });

  it('bars before and after with both shares; the legend has the answers and where they come from', async () => {
    body = ready([
      q({
        score: {
          comparable: { degree: 'comparable', note: 'x' },
          before: { mean: 1.14, critical: 0.43 },
          after: { mean: 0.2, critical: 0 },
          change: { delta: -0.94, kind: 'betre' },
          critical_change: { delta: -43, kind: 'betre' },
        },
      }),
    ]);
    const div = await tab();
    expect(div.querySelectorAll('.sem-atterhald li')).toHaveLength(4);
    expect(div.querySelector('[data-testid="fe-tal"]')?.textContent).toBe(
      'Før seminaret: 7 svar (publiserte tal). Etter: 5 svar (levande tal).',
    );
    const rows = [...div.querySelectorAll('[data-testid="fe-F12"] .poll-rad')];
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Ja: før 40 %, etter 80 %',
      'Nei: før 60 %, etter 20 %',
    ]);
    const bars = rows[0]!.querySelectorAll<HTMLElement>('.sem-to-band span');
    expect([bars[0]!.className, bars[0]!.style.transform]).toEqual(['for', 'scaleX(0.4)']);
    expect([bars[1]!.className, bars[1]!.style.transform]).toEqual(['etter', 'scaleX(0.8)']);
    expect(div.querySelector('[data-testid="fe-samla"]')?.textContent).toBe(
      'Alle spørsmål med poeng: snittscore 0,86 → 0,10 (−0,76, betre) · Kritisk andel 21 % → 0 % (−21 poeng, betre)',
    );
    expect(div.textContent).toContain('Same spørsmål og same utrekning i begge undersøkingane.');
    expect(div.querySelector('[data-testid="fe-F12"] .sem-fe-score')?.textContent).toBe(
      'Snittscore 1,14 → 0,20 (−0,94, betre) · Kritisk andel 43 % → 0 % (−43 poeng, betre)',
    );
    expect(div.textContent).toContain('Ikkje med i samanlikninga: Kviknes (svarte berre før).');
    expect(div.textContent).toContain('Berre i undersøkinga etter: Kva lærte du?.');
    // Per client: a hidden «etter» is «–», no change.
    const daco = [...div.querySelectorAll('.sem-fe-kundar tbody tr')][1]!;
    expect([...daco.querySelectorAll('th, td')].map((c) => c.textContent)).toEqual([
      'Daco',
      '4',
      '–',
      '0,63 → –',
      '25 % → –',
    ]);
    expect(findBokmal(div.textContent ?? '')).toEqual([]);
  });

  it('a hidden side has no bar and «–»; a changed question says why and has no numbers', async () => {
    body = ready([
      q({ after: { n: null, shares: [null, null] } }),
      q({
        id: 'F14',
        text: 'Brukar du MFA?',
        comparable: { degree: 'incomparable', note: 'Svaralternativa er endra.' },
        before: null,
        after: null,
        score: {
          comparable: { degree: 'incomparable', note: 'Svaralternativa er endra.' },
          before: null,
          after: null,
          change: null,
          critical_change: null,
        },
      }),
    ]);
    const div = await tab();
    const f12 = div.querySelector('[data-testid="fe-F12"]')!;
    expect([...f12.querySelectorAll('.sem-fe-tal b')].map((b) => b.textContent)).toEqual([
      '–',
      '–',
    ]);
    expect(f12.querySelector<HTMLElement>('.etter')!.style.transform).toBe('scaleX(0)');
    expect(f12.textContent).toContain('Etter: talet er skjult.');
    expect(f12.textContent).toContain('Grupper med færre enn tre svar');
    const f14 = div.querySelector('[data-testid="fe-F14"]')!;
    expect(f14.querySelector('.sem-merke')?.textContent).toBe(
      'Kan ikkje samanliknast. Svaralternativa er endra.',
    );
    expect(f14.querySelector('.poll')).toBeNull();
    expect(f14.textContent).not.toMatch(/\d/);
  });

  it('questions without a number on either side are one line, not empty bars', async () => {
    body = ready([
      q({}),
      q({
        id: 'F3',
        label: 'Fokus på sikkerheit',
        before: { n: null, shares: [null, null] },
        after: { n: null, shares: [null, null] },
      }),
      q({
        id: 'F4',
        label: 'Opplevd svindelforsøk',
        before: { n: null, shares: [null, null] },
        after: { n: null, shares: [null, null] },
      }),
    ]);
    const div = await tab();
    expect(div.querySelectorAll('.sem-fe-sporsmal')).toHaveLength(1);
    expect(div.querySelector('[data-testid="fe-utan-tal"]')?.textContent).toBe(
      'For få svar til å vise tal: Fokus på sikkerheit, Opplevd svindelforsøk.',
    );
  });

  it('the client filter asks for one client; the table per client is then left out', async () => {
    body = ready([q({})]);
    const div = await tab();
    body = {
      ...(ready([q({})]) as Extract<BeforeAfter, { ready: true }>),
      client: 'daco',
      clients: [],
    };
    act(() => button(div, 'Daco').click());
    await settle();
    expect(fetcher).toHaveBeenCalledWith(
      `/api/admin/seminars/${ID}/before-after?client=daco`,
      expect.anything(),
    );
    expect(div.querySelector('.sem-fe-kundar')).toBeNull();
  });
});
