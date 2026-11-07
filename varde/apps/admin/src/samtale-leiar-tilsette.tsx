// «Leiar og tilsette» on the summary of a conversation (2.22c, decision 07.11): each question of the
// guide that has a pair, the rating it got in the conversation and how the client's employees answered
// in its latest released tryggleik survey. Nothing when the client has no such survey.
import { Icon } from './icons.js';
import { follow } from './nav.js';
import { Mark } from './samtale-felt.js';
import { type GuideQuestion, RATING, type Rating } from './samtale-models.js';
import { kjelde, Linjer, useTilsette } from './samtale-tilsette.js';

export function LeiarOgTilsette({
  interview,
  items,
  at,
}: {
  interview: string;
  items: readonly { q: GuideQuestion; n: number; r: Rating | null }[];
  at: (n: number) => string;
}) {
  const t = useTilsette(interview);
  const round = t.data?.round;
  const rows = items.flatMap((x) => {
    const lines = t.data?.questions.find((q) => q.question === x.q.id)?.employees ?? [];
    return lines.length ? [{ ...x, lines }] : [];
  });
  if (t.isError)
    return (
      <section className="kort sm-lt">
        <div className="kort-innhald sm-lt-feil">
          <p className="muted">Fekk ikkje henta svara frå dei tilsette.</p>
          <button type="button" className="btn sm" onClick={() => void t.refetch()}>
            Prøv igjen
          </button>
        </div>
      </section>
    );
  if (!round || !rows.length) return null;
  return (
    <section className="kort sm-lt" aria-labelledby="sm-lt-tittel">
      <div className="kort-hovud">
        <h2 id="sm-lt-tittel">
          <Icon name="folk" small />
          Leiar og tilsette <span className="muted">{rows.length}</span>
        </h2>
        <p>Vurderinga i samtalen ved sida av det dei tilsette svarte. {kjelde(round)}</p>
      </div>
      <div className="kort-innhald">
        <ul className="sm-lt-liste">
          {rows.map((x) => (
            <li key={x.q.id}>
              <span className="sm-nr">{x.n + 1}</span>
              <div className="sm-punkt">
                <b>{x.q.short}</b>
                <span className="sm-lt-vurd">
                  <Mark rating={x.r} />
                  <span className="sr-only">Vurdering: </span>
                  {x.r ? RATING[x.r].word : 'Ikkje vurdert'}
                </span>
                <Linjer lines={x.lines} round={round} />
              </div>
              <a
                className="linkbtn"
                href={at(x.n)}
                onClick={(e) => follow(e, at(x.n))}
                aria-label={`Endre ${x.n + 1} ${x.q.short}`}
              >
                Endre
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
