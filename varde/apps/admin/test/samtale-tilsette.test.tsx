// «Leiar vs tilsette» (2.22c): the employees' line under the leader's answer and the summary card. The
// shares are rounded as the dashboard rounds them, a hidden line says so without a number, nothing shows
// without a released survey or a pair, and a screen reader hears commas where the eye sees dots.
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LeiarOgTilsette } from '../src/samtale-leiar-tilsette.js';
import type { GuideQuestion, Rating } from '../src/samtale-models.js';
import {
  kjelde,
  share,
  type TilsetteLinje,
  TilsetteLinjer,
  type TilsetteSvar,
  tilsetteKven,
  tilsetteTal,
} from '../src/samtale-tilsette.js';
import { button, mount, settle } from './support.js';

const mfa: TilsetteLinje = {
  id: 'F14',
  label: 'Brukar MFA',
  text: 'Brukar du tofaktorautentisering (MFA) når du loggar på jobb-system?',
  multi: false,
  suppressed: false,
  n: 12,
  options: [
    { id: 'ja', label: 'Ja', count: 7 },
    { id: 'nei', label: 'Nei', count: 4 },
    { id: 'usikker', label: 'Usikker', count: 1 },
  ],
};
const kvar: TilsetteLinje = {
  id: 'F15',
  label: 'MFA kvar',
  text: 'Kvar av desse brukar du MFA i?',
  multi: true,
  suppressed: true,
};
const round = { id: 'r2', name: 'Runde 2 IT-tryggleik', closed_on: '2026-10-31' };
const svar: TilsetteSvar = {
  round,
  questions: [
    { question: 'N12', employees: [mfa, kvar] },
    { question: 'N28', employees: [{ ...mfa, id: 'F12', label: 'Veit kor dei skal melde frå' }] },
  ],
};
let view: ReturnType<typeof mount> | undefined;
let urls: string[] = [];
function server(body: unknown, status = 200) {
  urls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      urls.push(url);
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    }),
  );
}
/** What a screen reader reads: without the parts hidden from it. */
const spoken = (el: Element) => {
  const c = el.cloneNode(true) as Element;
  c.querySelectorAll('[aria-hidden="true"]').forEach((x) => x.remove());
  return c.textContent;
};
/** What the eye sees: without the text only for screen readers. */
const seen = (el: Element) => {
  const c = el.cloneNode(true) as Element;
  c.querySelectorAll('.sr-only').forEach((x) => x.remove());
  return c.textContent;
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-07T10:00:00'));
});
afterEach(() => {
  view?.close();
  view = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('rounds each share as the dashboard does, with a space that does not break', () => {
  expect([share(7, 12), share(4, 12), share(1, 12)]).toEqual([
    '58\u00a0%',
    '33\u00a0%',
    '8\u00a0%',
  ]);
  expect([share(1, 8), share(3, 8), share(0, 5), share(5, 5)]).toEqual([
    '13\u00a0%',
    '38\u00a0%',
    '0\u00a0%',
    '100\u00a0%',
  ]);
  // Rounded one by one: three thirds give 33 % each, not 100 % in all.
  expect([1, 1, 1].map((c) => share(c, 3))).toEqual(['33\u00a0%', '33\u00a0%', '33\u00a0%']);
});

it('words a line in the labels of the template, a hidden one without numbers', () => {
  expect(tilsetteKven(mfa)).toBe('Brukar MFA (12 svar):');
  expect(tilsetteTal(mfa)).toEqual([
    'Ja\u00a058\u00a0%',
    'Nei\u00a033\u00a0%',
    'Usikker\u00a08\u00a0%',
  ]);
  expect(tilsetteKven(kvar)).toBe('MFA kvar:');
  expect(tilsetteTal(kvar)).toEqual(['For få svar til å vise']);
  const empty = { ...mfa, n: 0, options: mfa.options.map((o) => ({ ...o, count: 0 })) };
  expect([tilsetteKven(empty), tilsetteTal(empty)]).toEqual([
    'Brukar MFA:',
    ['For få svar til å vise'],
  ]);
  expect(kjelde(round)).toBe('Frå «Runde 2 IT-tryggleik», avslutta 31. oktober.');
  expect(kjelde({ ...round, closed_on: '2025-12-01' })).toBe(
    'Frå «Runde 2 IT-tryggleik», avslutta 1. desember 2025.',
  );
  expect(kjelde({ ...round, closed_on: null })).toBe('Frå «Runde 2 IT-tryggleik».');
});

it('shows the lines of the question under the answer; the question and the survey open under each', async () => {
  server(svar);
  view = mount(<TilsetteLinjer interview="iv1" question="N12" />, true);
  await settle();
  expect(urls).toEqual(['/api/admin/interviews/iv1/employees']);
  const group = view.div.querySelector('[role="group"]')!;
  expect(group.getAttribute('aria-label')).toBe('Svar frå dei tilsette');
  const [first, second] = [...group.querySelectorAll('summary')];
  expect(seen(first!)).toBe(
    'Tilsette\u00a0· Brukar MFA (12 svar): Ja\u00a058\u00a0%\u00a0· Nei\u00a033\u00a0%\u00a0· Usikker\u00a08\u00a0%',
  );
  expect(spoken(first!)).toBe(
    'Tilsette, Brukar MFA (12 svar): Ja\u00a058\u00a0%, Nei\u00a033\u00a0%, Usikker\u00a08\u00a0%',
  );
  expect(seen(second!)).toBe('Tilsette\u00a0· MFA kvar: For få svar til å vise');
  const [a, b] = [...group.querySelectorAll('.sm-tl-kjelde')].map((k) => k.textContent);
  expect(a).toContain('«Brukar du tofaktorautentisering (MFA) når du loggar på jobb-system?»');
  expect(a).toContain('Frå «Runde 2 IT-tryggleik», avslutta 31. oktober.');
  expect(a).toContain('Grupper med færre enn 3 svar blir ikkje viste.');
  expect(a).not.toContain('fleire svar');
  expect(b).toContain('Dei kunne velje fleire svar');
  expect(group.querySelectorAll('details[open]')).toHaveLength(0);
});

it('shows nothing for a question without a pair or a client without a released survey', async () => {
  server(svar);
  view = mount(<TilsetteLinjer interview="iv1" question="N2" />, true);
  await settle();
  expect(view.div.innerHTML).toBe('');
  view.close();
  server({ round: null, questions: [] });
  view = mount(<TilsetteLinjer interview="iv2" question="N12" />, true);
  await settle();
  expect(urls).toHaveLength(1);
  expect(view.div.innerHTML).toBe('');
});

const guide = (id: string, short: string): GuideQuestion => ({
  id,
  section: '',
  short,
  text: short,
  help: null,
  criteria: null,
});
const items: { q: GuideQuestion; n: number; r: Rating | null }[] = [
  { q: guide('N2', 'Kven har IT-ansvaret'), n: 0, r: 'ivaretatt' },
  { q: guide('N12', '2-faktorpålogging'), n: 10, r: 'forbetring' },
  { q: guide('N28', 'Kven ein kontaktar'), n: 26, r: null },
];

it('lists the paired questions on the summary in guide order, with the rating beside the employees', async () => {
  server(svar);
  view = mount(<LeiarOgTilsette interview="iv1" items={items} at={(n) => `/q/${n}`} />, true);
  await settle();
  const card = view.div.querySelector('section.kort')!;
  expect(card.querySelector('h2')!.textContent).toBe('Leiar og tilsette 2');
  expect(card.querySelector('.kort-hovud p')!.textContent).toBe(
    'Vurderinga i samtalen ved sida av det dei tilsette svarte. Frå «Runde 2 IT-tryggleik», avslutta 31. oktober.',
  );
  const rows = [...card.querySelectorAll('.sm-lt-liste > li')];
  expect(rows.map((r) => r.querySelector('.sm-nr')!.textContent)).toEqual(['11', '27']);
  // The rating as everywhere in Samtalar: a glyph in a disc and the word, never the colour alone.
  expect(rows.map((r) => seen(r.querySelector('.sm-lt-vurd')!))).toEqual([
    '!Forbetringspotensial',
    'Ikkje vurdert',
  ]);
  expect(rows.map((r) => r.querySelector('.sm-mark')!.className)).toEqual([
    'sm-mark sm-fb',
    'sm-mark sm-tom',
  ]);
  expect(rows.map((r) => spoken(r.querySelector('.sm-lt-vurd')!))).toEqual([
    'Vurdering: Forbetringspotensial',
    'Vurdering: Ikkje vurdert',
  ]);
  expect(rows.map((r) => r.querySelectorAll('summary').length)).toEqual([2, 1]);
  expect(rows[1]!.querySelector('a')!.getAttribute('href')).toBe('/q/26');
  expect(rows[1]!.querySelector('a')!.getAttribute('aria-label')).toBe(
    'Endre 27 Kven ein kontaktar',
  );
});

it('has no card without a released survey; when the numbers could not be read it says so and tries again', async () => {
  server({ round: null, questions: [] });
  view = mount(<LeiarOgTilsette interview="iv1" items={items} at={(n) => `/q/${n}`} />, true);
  await settle();
  expect(view.div.innerHTML).toBe('');
  view.close();
  server({ message: 'Noko gjekk gale.' }, 500);
  view = mount(<LeiarOgTilsette interview="iv3" items={items} at={(n) => `/q/${n}`} />, true);
  await settle();
  expect(view.div.querySelector('p')!.textContent).toBe('Fekk ikkje henta svara frå dei tilsette.');
  // «Prøv igjen» asks once more; an answer now shows the card.
  server(svar);
  act(() => button(view!.div, 'Prøv igjen').click());
  await settle();
  expect(urls).toEqual(['/api/admin/interviews/iv3/employees']);
  expect(view.div.querySelector('h2')!.textContent).toBe('Leiar og tilsette 2');
});
