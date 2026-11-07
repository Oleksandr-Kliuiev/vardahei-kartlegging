// Step 3 of Samtalar (3.1, 3.2): each rating button says when it applies, its name stays the word; a
// repeat conversation shows last time's rating under the question, «Før og etter» on the summary and one
// line on the client page. Moves follow Manglar < Forbetringspotensial < Ivaretatt only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForrigeGong, Sporsmalskort } from '../src/samtale-felt.js';
import { ForEtterLinje, ForOgEtter, movesOf } from '../src/samtale-for-etter.js';
import { Lagring, serverValues } from '../src/samtale-lagring.js';
import type {
  ClientInterview,
  Counts,
  GuideQuestion,
  Interview,
  Previous,
  Rating,
} from '../src/samtale-models.js';
import { mount } from './support.js';

const q = (
  id: string,
  short: string,
  criteria: GuideQuestion['criteria'] = null,
): GuideQuestion => ({
  id,
  section: 'Ansvar og rolle',
  short,
  text: `${short}?`,
  help: null,
  criteria,
});
const N2 = q('N2', 'Kven har IT-ansvaret', {
  ivaretatt: 'Éin namngitt ansvarleg med stadfortredar.',
  forbetring: 'Nokon tek det i praksis, men det er ikkje avklart.',
  manglar: 'Ingen har ansvaret.',
});
const N3 = q('N3', 'Informasjon om endringar');
const N4 = q('N4', 'Privat e-post');
const N5 = q('N5', 'Deling av filer');
const counts = (c: Partial<Counts>): Counts => ({
  ivaretatt: 0,
  forbetring: 0,
  manglar: 0,
  ikkje_aktuelt: 0,
  none: 0,
  ...c,
});
const previous: Previous = {
  id: 'p1',
  held_on: '2026-05-04',
  round: { id: 'r1', name: 'Vår 2026' },
  counts: counts({ forbetring: 2, manglar: 1, none: 1 }),
  score: 33,
  answers: {
    N2: { rating: 'forbetring', answer: 'Dagleg leiar tek det.', action: 'Peik ut ein ansvarleg.' },
    N3: { rating: 'manglar', answer: '', action: '' },
    N4: { rating: 'forbetring', answer: '', action: '' },
  },
};
function store(ratings: Record<string, Rating | null>) {
  const i = {
    id: `t-${Math.random()}`,
    summary: '',
    agreed: '',
    note: '',
    guide: { title: 'G', label: 'v1', questions: [N2, N3, N4, N5] },
    answers: Object.fromEntries(
      Object.entries(ratings).map(([k, rating]) => [
        k,
        { answer: '', rating, action: '', note: '', updated_at: '', updated_by: '' },
      ]),
    ),
  } as unknown as Interview;
  const s = new Lagring(i.id);
  s.load(serverValues(i), false);
  return s;
}

let view: ReturnType<typeof mount> | undefined;
// The card also asks for the employees' lines (2.22c): answer that there is no released survey.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ class: 'aggregate', round: null, questions: [] })),
      ),
    ),
  );
});
afterEach(() => {
  view?.close();
  view = undefined;
  localStorage.clear();
  vi.unstubAllGlobals();
});
const card = (question: GuideQuestion, prev: Previous | null) =>
  mount(
    <Sporsmalskort
      q={question}
      n={1}
      total={4}
      store={store({})}
      readOnly={false}
      focusOnShow={false}
      previous={prev}
      onPrev={() => undefined}
      onNext={() => undefined}
    />,
    true,
  );
const byId = (id: string | null) => (id ? document.getElementById(id) : null);

describe('criteria under the rating buttons (3.1)', () => {
  it('each button names its word, is described by its criterion and keeps its shortcut', () => {
    view = card(N2, null);
    const radios = [...view.div.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(radios.map((b) => byId(b.getAttribute('aria-labelledby'))?.textContent)).toEqual([
      'Ivaretatt',
      'Forbetringspotensial',
      'Manglar',
    ]);
    expect(radios.map((b) => byId(b.getAttribute('aria-describedby'))?.textContent)).toEqual([
      'Éin namngitt ansvarleg med stadfortredar.',
      'Nokon tek det i praksis, men det er ikkje avklart.',
      'Ingen har ansvaret.',
    ]);
    // The criterion is a second line inside the button; the chip stays.
    expect(radios.every((b) => b.contains(byId(b.getAttribute('aria-describedby'))))).toBe(true);
    expect(radios.map((b) => b.querySelector('kbd')?.textContent)).toEqual([
      'Alt+1',
      'Alt+2',
      'Alt+3',
    ]);
    expect(radios.map((b) => b.getAttribute('aria-keyshortcuts'))).toEqual([
      'Alt+1',
      'Alt+2',
      'Alt+3',
    ]);
  });

  it('a question without criteria has no second line and no description', () => {
    view = card(N3, null);
    const radios = [...view.div.querySelectorAll('[role="radio"]')];
    expect(radios.some((b) => b.hasAttribute('aria-describedby'))).toBe(false);
    expect(view.div.querySelector('.sm-val small')).toBeNull();
  });
});

describe('«Førre gong» under the question (3.2)', () => {
  it('names the day and the rating; what the client said and the conclusion open under it', () => {
    view = card(N2, previous);
    const line = view.div.querySelector('details.sm-forre')!;
    expect(line.querySelector('summary')?.textContent).toBe(
      'Førre gong (04.05.2026):!Forbetringspotensial',
    );
    expect([...line.querySelectorAll('dt')].map((d) => d.textContent)).toEqual([
      'Kunden sa',
      'Konklusjon og tiltak',
    ]);
    expect([...line.querySelectorAll('dd')].map((d) => d.textContent)).toEqual([
      'Dagleg leiar tek det.',
      'Peik ut ein ansvarleg.',
    ]);
  });

  it('a rating alone is a plain line; no answer then, or no previous conversation, is nothing', () => {
    view = card(N3, previous);
    expect(view.div.querySelector('p.sm-forre')?.textContent).toBe(
      'Førre gong (04.05.2026):✕Manglar',
    );
    expect(view.div.querySelector('details.sm-forre')).toBeNull();
    view.close();
    view = card(N5, previous);
    expect(view.div.querySelector('.sm-forre')).toBeNull();
    view.close();
    view = card(N2, null);
    expect(view.div.querySelector('.sm-forre')).toBeNull();
    view.close();
    view = mount(
      <ForrigeGong day={null} answer={{ rating: null, answer: 'Veit ikkje', action: '' }} />,
    );
    expect(view.div.querySelector('summary')?.textContent).toBe('Førre gong:ikkje vurdert');
  });
});

describe('«Før og etter» (3.2)', () => {
  const now: Record<string, Rating | null> = {
    N2: 'ivaretatt',
    N3: 'forbetring',
    N4: 'manglar',
    N5: 'ivaretatt',
  };

  it('moves are steps on the scale; «Ikkje aktuelt» or no rating on either side is none', () => {
    const then = (id: string) => previous.answers[id]?.rating ?? null;
    const m = movesOf([N2, N3, N4, N5], then, (id) => now[id] ?? null);
    expect(m.better.map((x) => [x.n + 1, x.q.id, x.from, x.to])).toEqual([
      [1, 'N2', 'forbetring', 'ivaretatt'],
      [2, 'N3', 'manglar', 'forbetring'],
    ]);
    expect(m.worse.map((x) => [x.n + 1, x.q.id, x.from, x.to])).toEqual([
      [3, 'N4', 'forbetring', 'manglar'],
    ]);
    expect(
      movesOf(
        [N2, N3],
        () => 'ikkje_aktuelt',
        (id) => (id === 'N2' ? 'ivaretatt' : null),
      ),
    ).toEqual({ better: [], worse: [] });
  });

  it('the card shows the score and counts then and now and the questions that moved', () => {
    view = mount(
      <ForOgEtter
        previous={previous}
        questions={[N2, N3, N4, N5]}
        rating={(id) => now[id] ?? null}
        counts={counts({ ivaretatt: 2, forbetring: 1, manglar: 1 })}
        score={63}
        kunde={false}
      />,
    );
    const rows = [...view.div.querySelectorAll('tr')].map((r) =>
      [...r.children].map((c) => c.textContent),
    );
    expect(rows).toEqual([
      ['Vurdering', 'Før', 'Etter'],
      ['Poeng', '33', '63'],
      ['✓Ivaretatt', '0', '2'],
      ['!Forbetringspotensial', '2', '1'],
      ['✕Manglar', '1', '1'],
      ['·Ikkje aktuelt', '0', '0'],
    ]);
    const groups = [...view.div.querySelectorAll('.sm-gruppe')];
    expect(groups.map((g) => g.querySelector('h3')?.textContent)).toEqual(['Betre 2', 'Verre 1']);
    expect([...groups[1]!.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      '3Privat e-post!→✕frå Forbetringspotensial til Manglar',
    ]);
    expect(view.div.textContent).toContain('Samanlikna med samtalen 04.05.2026 i «Vår 2026»');
  });

  it('«Vis for kunden» hides the score, as on the rest of the summary', () => {
    view = mount(
      <ForOgEtter
        previous={previous}
        questions={[N2]}
        rating={() => 'forbetring'}
        counts={counts({ forbetring: 1 })}
        score={50}
        kunde
      />,
    );
    expect(view.div.textContent).not.toContain('Poeng');
    expect(view.div.textContent).toContain('Ingen spørsmål har fått ei anna vurdering enn sist.');
  });

  it('the client page has one line for the latest finished conversation with a previous one', () => {
    const row = (
      id: string,
      held_on: string,
      status: ClientInterview['status'],
      score: number | null,
      change: ClientInterview['change'] = null,
    ): ClientInterview => ({
      id,
      status,
      held_on,
      done_at: null,
      round: { id: `r-${id}`, name: id },
      counts: counts({}),
      score,
      change,
    });
    const list = [
      row('going', '2026-12-01', 'in_progress', 80),
      row('autumn', '2026-11-10', 'done', 71, {
        previous: { id: 'spring', held_on: '2026-05-04', score: 58 },
        better: 5,
        worse: 1,
      }),
      row('spring', '2026-05-04', 'done', 58),
    ];
    view = mount(<ForEtterLinje list={list} />);
    // The arrow is for the eye; a screen reader hears «til».
    expect(view.div.textContent?.replace(/\s+/g, ' ')).toBe(
      'Før og etter04.05.2026 → til 10.11.2026Poeng 58 → til 71 (+13)5 betre1 verre',
    );
    expect(view.div.querySelector('[aria-hidden="true"]')?.textContent).toBe(' → ');
    view.close();
    view = mount(<ForEtterLinje list={[list[0]!, list[2]!]} />);
    expect(view.div.textContent).toBe('');
  });
});
