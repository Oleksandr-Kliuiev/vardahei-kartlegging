// 2.21 the overview and the referat in the admin: the order of the weakest points, of the themes and of
// the clients, the gaps between themes on the map, the tip of a cell, a seminar topic at half of the
// clients; the map is one stop for Tab and the arrows move over the holes a guide leaves; the referat
// sheets carry what the client said and what to do, Manglar before Forbetringspotensial, and say that
// the own notes are not with them.
import { afterEach, expect, it } from 'vitest';
import { act } from 'react';
import { Kart } from '../src/samtale-kart.js';
import type { Counts, Overview, OverviewQuestion, Referat } from '../src/samtale-models.js';
import { Ark, fullDate } from '../src/samtale-referat.js';
import {
  cellTip,
  lowestFirst,
  mapColumns,
  mapRows,
  missing,
  pct,
  seminarTopic,
  weakest,
} from '../src/samtale-tal.js';
import { mount } from './support.js';

const c = (iv: number, fb: number, mg: number, na = 0, none = 0): Counts => ({
  ivaretatt: iv,
  forbetring: fb,
  manglar: mg,
  ikkje_aktuelt: na,
  none,
});
const q = (id: string, no: number, section: string, counts = c(0, 0, 0)): OverviewQuestion => ({
  id,
  no,
  section,
  short: `Kort ${id}`,
  text: `Spørsmål ${id}?`,
  help: null,
  counts,
  actions: 0,
});

let view: ReturnType<typeof mount> | undefined;
afterEach(() => {
  view?.close();
  view = undefined;
});

it('puts the weakest points first: most Manglar, then most Forbetring, nothing rated last', () => {
  const list = weakest([
    q('A', 1, 'T', c(0, 0, 0, 2, 1)),
    q('B', 2, 'T', c(1, 1, 2)),
    q('C', 3, 'T', c(0, 2, 2)),
    q('D', 4, 'T', c(3, 0, 1)),
    q('E', 5, 'T', c(0, 1, 0)),
  ]);
  expect(list.map((x) => x.id)).toEqual(['C', 'B', 'D', 'E', 'A']);
  expect(missing(c(1, 1, 2))).toBe(0.5);
  expect(missing(c(0, 0, 0, 3))).toBeNull();
  expect(pct(1, 3)).toBe(33);
  expect(pct(2, 0)).toBe(0);
});

it('puts the lowest score first, nothing rated last, the name between equals', () => {
  const list = lowestFirst(
    [
      { n: 'Bygg', score: 50 },
      { n: 'Ingen', score: null },
      { n: 'Advokat', score: 50 },
      { n: 'Hotell', score: 12 },
    ],
    (x) => x.n,
  );
  expect(list.map((x) => x.n)).toEqual(['Hotell', 'Advokat', 'Bygg', 'Ingen']);
});

it('leaves a gap on the map where a new theme begins, and none before the first', () => {
  const cols = mapColumns([q('N2', 1, 'Ansvar'), q('N3', 2, 'Ansvar'), q('N4', 3, 'E-post')]);
  expect(cols.map((x) => (x.gap ? '|' : x.q.id))).toEqual(['N2', 'N3', '|', 'N4']);
});

it('calls a conclusion half of the clients have a seminar topic', () => {
  expect(seminarTopic(9, 18)).toBe(true);
  expect(seminarTopic(8, 18)).toBe(false);
  expect(seminarTopic(0, 0)).toBe(false);
});

const row = (
  id: string,
  name: string,
  score: number | null,
  round = 'r1',
  cells: Overview['conversations'][number]['cells'] = {},
): Overview['conversations'][number] => ({
  id,
  status: 'done',
  held_on: '2026-11-10',
  client: { id: `k-${id}`, name },
  round: { id: round, name: round === 'r1' ? 'Haust' : 'Vår' },
  counts: c(0, 0, 0),
  score,
  actions: 0,
  cells,
});

it('says in the tip the rating, then the conclusion, else what the client said', () => {
  const r = row('a', 'Rekneskap 01', 50, 'r1', {
    N2: { rating: 'manglar', answer: 'Ingen ansvarleg', action: 'Peik ut | ein ansvarleg' },
    N3: { rating: 'forbetring', answer: 'Av og til', action: '  ' },
    N4: { rating: null, answer: '', action: '' },
  });
  expect(cellTip(r, q('N2', 1, 'T'))).toBe(
    'Rekneskap 01 · 1 Kort N2|Manglar|Tiltak: Peik ut / ein ansvarleg',
  );
  expect(cellTip(r, q('N3', 2, 'T'))).toBe(
    'Rekneskap 01 · 2 Kort N3|Forbetringspotensial|Av og til',
  );
  expect(cellTip(r, q('N4', 3, 'T'))).toBe('Rekneskap 01 · 3 Kort N4|Ikkje vurdert|');
});

it('sorts the map by score or by name', () => {
  const rows = [row('a', 'Bygg', 70), row('b', 'Advokat', null), row('c', 'Hotell', 20)];
  expect(mapRows(rows, 'svakast').map((r) => r.client.name)).toEqual(['Hotell', 'Bygg', 'Advokat']);
  expect(mapRows(rows, 'namn').map((r) => r.client.name)).toEqual(['Advokat', 'Bygg', 'Hotell']);
});

/** Two rounds on two guides: the older one has no N4, so its row has a hole there. */
const overview = (): Overview => {
  const questions = [q('N2', 1, 'Ansvar'), q('N3', 2, 'Ansvar'), q('N4', 3, 'E-post')];
  return {
    rounds: [
      { id: 'r1', name: 'Haust', questions: ['N2', 'N3', 'N4'] },
      { id: 'r2', name: 'Vår', questions: ['N2', 'N3'] },
    ],
    in_progress: false,
    questions,
    sections: [],
    conversations: [
      row('a', 'Rekneskap 01', 20, 'r1', {
        N2: { rating: 'manglar', answer: 'Nei', action: '' },
        N3: { rating: 'ivaretatt', answer: 'Ja', action: '' },
        N4: { rating: null, answer: '', action: '' },
      }),
      row('b', 'Elektro 02', 60, 'r2', {
        N2: { rating: 'forbetring', answer: 'Delvis', action: 'Lag ein plan' },
        N3: { rating: 'ikkje_aktuelt', answer: '', action: '' },
      }),
    ],
    totals: {
      conversations: 2,
      done: 2,
      in_progress: 0,
      shown: 2,
      counts: c(1, 1, 1, 1, 1),
      score: 40,
      actions: 1,
    },
    actions: [],
  };
};
const press = (el: Element, key: string, ctrl = false) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: ctrl, bubbles: true }));
  });

it('names every cell in words, links it to that answer and keeps one cell in the Tab order', () => {
  view = mount(<Kart data={overview()} order="svakast" />);
  const cells = [...view.div.querySelectorAll<HTMLAnchorElement>('a.sm-celle')];
  expect(cells).toHaveLength(5);
  expect(cells[0]!.getAttribute('aria-label')).toBe('Rekneskap 01, 1 Kort N2: manglar');
  expect(cells[0]!.getAttribute('href')).toBe('/admin/samtalar/a?q=N2');
  expect(cells[0]!.textContent).toBe('✕');
  expect(cells[2]!.getAttribute('aria-label')).toBe('Rekneskap 01, 3 Kort N4: ikkje vurdert');
  expect(cells.filter((a) => a.tabIndex === 0)).toEqual([cells[0]]);
  // The older guide has no N4: a hole, not a cell that says «ikkje vurdert».
  expect(view.div.querySelectorAll('.sm-celle-utan')).toHaveLength(1);
  // The row name leads to the client; the theme gap is one column.
  expect(view.div.querySelector('a.sm-kart-namn')!.getAttribute('href')).toBe('/admin/clients/k-a');
  expect(view.div.querySelectorAll('.sm-kart-gap')).toHaveLength(2 + 2);
});

it('moves with the arrows, Home and End, over the hole the older guide leaves', () => {
  view = mount(<Kart data={overview()} order="svakast" />);
  const at = (r: number, c: number) =>
    view!.div.querySelector<HTMLAnchorElement>(`a[data-r="${r}"][data-c="${c}"]`);
  act(() => at(0, 0)!.focus());
  press(document.activeElement!, 'ArrowRight');
  expect(document.activeElement).toBe(at(0, 1));
  press(document.activeElement!, 'End');
  expect(document.activeElement).toBe(at(0, 2));
  // Down from N4: Elektro 02 has no N4 and nothing below it, so focus stays.
  press(document.activeElement!, 'ArrowDown');
  expect(document.activeElement).toBe(at(0, 2));
  press(document.activeElement!, 'Home');
  press(document.activeElement!, 'ArrowDown');
  expect(document.activeElement).toBe(at(1, 0));
  // End in a row with a hole stops at its last cell; the cell used last is the one Tab reaches.
  press(document.activeElement!, 'End');
  expect(document.activeElement).toBe(at(1, 1));
  expect(at(1, 1)!.tabIndex).toBe(0);
  expect(at(0, 0)!.tabIndex).toBe(-1);
  press(document.activeElement!, 'Home', true);
  expect(document.activeElement).toBe(at(0, 0));
});

const referat = (status: Referat['status'] = 'done'): Referat => ({
  id: 'i1',
  status,
  held_on: '2026-11-10',
  done_at: '2026-11-10T14:30:00Z',
  client: { id: 'k1', name: 'Rekneskap 01' },
  round: { id: 'r1', name: 'Haust 2026 · IT-kundar' },
  interviewees: [{ role: 'dagleg leiar', name: 'Kari Nordmann' }],
  interviewers: ['Asbjørn', 'Oleksandr'],
  summary: 'God merksemd i leiinga.',
  agreed: 'Tilbod innan 2. desember.',
  counts: c(1, 1, 1, 0, 1),
  questions: [
    {
      id: 'N2',
      no: 1,
      short: 'Ansvar',
      section: 'A',
      answer: 'Ja',
      rating: 'ivaretatt',
      action: '',
    },
    {
      id: 'N3',
      no: 2,
      short: 'Endringar',
      section: 'A',
      answer: 'Delvis',
      rating: 'forbetring',
      action: 'Fast sak',
    },
    {
      id: 'N4',
      no: 3,
      short: 'Privat e-post',
      section: 'B',
      answer: 'Nei',
      rating: 'manglar',
      action: 'Reglar',
    },
    { id: 'N5', no: 4, short: 'Deling', section: 'B', answer: '', rating: null, action: '' },
  ],
});

it('writes the referat on two sheets: Manglar before Forbetring, every answer, no own notes', () => {
  view = mount(<Ark r={referat()} />);
  const [one, two] = [...view.div.querySelectorAll('article.sm-ark')];
  expect(one!.textContent).toContain('Samtale om IT-tryggleik');
  expect(one!.querySelector('h2')!.textContent).toBe('Rekneskap 01');
  expect(one!.textContent).toContain(
    '10.\u00a0november\u00a02026\u00a0· Kari Nordmann, dagleg leiar\u00a0· frå Vardahei IT: Asbjørn og Oleksandr',
  );
  expect(one!.textContent).toContain('✓Ivaretatt: 1!Forbetringspotensial: 1✕Manglar: 1');
  expect(one!.textContent).not.toContain('Ikkje aktuelt');
  const fix = [...one!.querySelectorAll('tbody tr')].map((tr) => tr.textContent);
  expect(fix).toEqual(['3Privat e-post✕ManglarReglar', '2Endringar!ForbetringspotensialFast sak']);
  expect(one!.textContent).toContain('Dette er på plassAnsvar');
  expect(one!.textContent).toContain('Tilbod innan 2. desember.');
  expect(two!.querySelectorAll('tbody tr')).toHaveLength(4);
  expect(two!.querySelector('tbody tr:last-child')!.textContent).toBe('4Deling–');
  expect(two!.textContent).toContain('Eigne notat frå Vardahei er ikkje med.');
  // The day of a document never breaks over two lines.
  expect(fullDate('2026-01-05')).toBe('5.\u00a0januar\u00a02026');
  expect([...one!.querySelectorAll('.sm-ark-side')].map((s) => s.textContent)).toEqual([
    'Side 1 av 2',
  ]);
});
