// «Før og etter» (3.2, decision 07.11): a repeat conversation set against the client's previous finished
// one with the same guide. The summary shows the score and the counts then and now and the questions
// that moved; the client page has one line for the latest two. Score: Ivaretatt 2, Forbetringspotensial
// 1, Manglar 0. A move is a step on the scale Manglar < Forbetringspotensial < Ivaretatt; «Ikkje
// aktuelt» or no rating on either side is none.
import { Mark } from './samtale-felt.js';
import {
  type ClientInterview,
  type Counts,
  dmy,
  type GuideQuestion,
  type Previous,
  RATING,
  type Rating,
} from './samtale-models.js';

const RANK: Partial<Record<Rating, number>> = { manglar: 0, forbetring: 1, ivaretatt: 2 };

export interface Move {
  q: GuideQuestion;
  /** The place of the question in this guide (0-based). */
  n: number;
  from: Rating;
  to: Rating;
}

/** The questions of this guide rated better or worse now than then, in the guide's order. */
export function movesOf(
  questions: readonly GuideQuestion[],
  then: (id: string) => Rating | null,
  now: (id: string) => Rating | null,
) {
  const better: Move[] = [],
    worse: Move[] = [];
  questions.forEach((q, n) => {
    const from = then(q.id),
      to = now(q.id);
    const a = from ? RANK[from] : undefined,
      b = to ? RANK[to] : undefined;
    if (a === undefined || b === undefined || a === b) return;
    (b > a ? better : worse).push({ q, n, from: from!, to: to! });
  });
  return { better, worse };
}

/** «58 → 71», read as «58 til 71». */
function Til({ from, to }: { from: number | string; to: number | string }) {
  return (
    <>
      {from}
      <span aria-hidden="true"> → </span>
      <span className="sr-only"> til </span>
      {to}
    </>
  );
}
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

const ROWS: readonly Rating[] = ['ivaretatt', 'forbetring', 'manglar', 'ikkje_aktuelt'];

function Flytt({ title, list }: { title: string; list: readonly Move[] }) {
  if (!list.length) return null;
  return (
    <div className="sm-gruppe">
      <h3>
        {title} <span className="muted">{list.length}</span>
      </h3>
      <ul>
        {list.map((m) => (
          <li key={m.q.id}>
            <span className="sm-nr">{m.n + 1}</span>
            <span className="sm-punkt">
              <b>{m.q.short}</b>
            </span>
            <span className="sm-fe-steg">
              <Mark rating={m.from} />
              <span aria-hidden="true">→</span>
              <Mark rating={m.to} />
              <span className="sr-only">
                frå {RATING[m.from].word} til {RATING[m.to].word}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The summary's card: then (the previous conversation) and now (this one, as rated on screen). */
export function ForOgEtter(p: {
  previous: Previous;
  questions: readonly GuideQuestion[];
  rating: (id: string) => Rating | null;
  counts: Counts;
  score: number | null;
  /** «Vis for kunden»: the score is hidden, as elsewhere on the summary. */
  kunde: boolean;
}) {
  const prev = p.previous;
  const { better, worse } = movesOf(
    p.questions,
    (id) => prev.answers[id]?.rating ?? null,
    p.rating,
  );
  return (
    <section className="kort sm-foretter" aria-labelledby="sm-foretter">
      <div className="kort-hovud">
        <h2 id="sm-foretter">Før og etter</h2>
        <p>
          Samanlikna med samtalen {dmy(prev.held_on)} i «{prev.round.name}»
        </p>
      </div>
      <div className="kort-innhald">
        <table className="sm-fe-tabell">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Vurdering</span>
              </th>
              <th scope="col">Før</th>
              <th scope="col">Etter</th>
            </tr>
          </thead>
          <tbody>
            {!p.kunde && (
              <tr className="sm-fe-poeng">
                <th scope="row">Poeng</th>
                <td>{prev.score ?? '–'}</td>
                <td>{p.score ?? '–'}</td>
              </tr>
            )}
            {ROWS.map((r) => (
              <tr key={r}>
                <th scope="row">
                  <span className="sm-fe-rad">
                    <Mark rating={r} />
                    {RATING[r].word}
                  </span>
                </th>
                <td>{prev.counts[r]}</td>
                <td>{p.counts[r]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Flytt title="Betre" list={better} />
        <Flytt title="Verre" list={worse} />
        {!better.length && !worse.length && (
          <p className="muted">Ingen spørsmål har fått ei anna vurdering enn sist.</p>
        )}
      </div>
    </section>
  );
}

/** The client page: one line for the latest finished conversation and the previous one with its guide. */
export function ForEtterLinje({ list }: { list: readonly ClientInterview[] }) {
  const latest = list
    .filter((i) => i.status === 'done' && i.change)
    .sort((a, b) => (b.held_on ?? '').localeCompare(a.held_on ?? ''))[0];
  const change = latest?.change;
  if (!latest || !change) return null;
  const from = change.previous.score,
    to = latest.score;
  return (
    <p className="sm-kunde-fe">
      <b>Før og etter</b>
      <span>
        <Til from={dmy(change.previous.held_on)} to={dmy(latest.held_on)} />
      </span>
      <span>
        Poeng <Til from={from ?? '–'} to={to ?? '–'} />
        {from !== null && to !== null && ` (${signed(to - from)})`}
      </span>
      <span>
        <b>{change.better}</b> betre
      </span>
      <span>
        <b>{change.worse}</b> verre
      </span>
    </p>
  );
}
