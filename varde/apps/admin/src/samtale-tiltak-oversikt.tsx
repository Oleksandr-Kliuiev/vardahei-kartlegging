// «Tiltak som går igjen» in Oversikt (2.21; 2.22b, decision 3.3 of 07.11): the actions of the catalogue
// chosen in the conversations first, each with how many clients chose it, the questions it came from and
// its seminar topic as the chip (accent when half or more of the clients have it, a seminar candidate);
// then, as in 2.21, the written conclusions of answers without an action of the catalogue, per question
// with the wording most of them used. The API groups and counts; this only shows.
import type { Overview } from './samtale-models.js';
import { seminarTopic } from './samtale-tal.js';
import './samtale-tiltak.css';

/** The conclusion of a question on the referat (A4) with the names of the actions of the catalogue
 * chosen for it on a line of their own; the referat never has a note. */
export function ReferatTiltak({
  action,
  catalog,
}: {
  action: string;
  catalog?: readonly string[] | undefined;
}) {
  return (
    <>
      {action}
      {catalog?.length ? (
        <span className={action.trim() ? 'sm-ark-katalog sm-ark-etter' : 'sm-ark-katalog'}>
          {catalog.join(' · ')}
        </span>
      ) : null}
    </>
  );
}

function Tal({ n, of }: { n: number; of: number }) {
  return (
    <span className="sm-tiltak-tal tnum">
      {n}
      <small>
        av {of} {of === 1 ? 'kunde' : 'kundar'}
      </small>
    </span>
  );
}

/** «Spørsmål 3 · Privat e-post» or «Spørsmål 3 · Privat e-post, 7 · Opplæring». */
export function questionsText(o: Pick<Overview, 'questions'>, ids: readonly string[]) {
  const byId = new Map(o.questions.map((q) => [q.id, q]));
  const named = ids.flatMap((id) => {
    const q = byId.get(id);
    return q ? [`${q.no} · ${q.short}`] : [];
  });
  return named.length ? `Spørsmål ${named.join(', ')}` : '';
}

export function TiltakIgjen({ o }: { o: Overview }) {
  const of = o.totals.shown;
  const catalog = o.catalog ?? [];
  const both = catalog.length > 0 && o.actions.length > 0;
  return (
    <section className="kort" aria-labelledby="sm-tiltak-h">
      <div className="kort-hovud">
        <h2 id="sm-tiltak-h">Tiltak som går igjen</h2>
        <p>Kandidatar til tenester og seminartema</p>
      </div>
      <div className="kort-innhald">
        {!catalog.length && !o.actions.length && (
          <p className="muted">Ingen tiltak er skrivne enno.</p>
        )}
        {catalog.length > 0 && (
          <>
            <h3 className="sm-tiltak-del">Frå katalogen</h3>
            <ul className="sm-tiltak">
              {catalog.map((g) => (
                <li key={g.action.id}>
                  <Tal n={g.clients} of={of} />
                  <span className="sm-tiltak-tekst">
                    <b>{g.action.name}</b>
                    <span>{questionsText(o, g.questions)}</span>
                  </span>
                  <span
                    className={
                      seminarTopic(g.clients, of)
                        ? 'chip accent sm-tiltak-tema'
                        : 'chip sm-tiltak-tema'
                    }
                  >
                    <span className="sr-only">Seminartema: </span>
                    {g.action.seminar_topic}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {o.actions.length > 0 && (
          <>
            {both && <h3 className="sm-tiltak-del">Andre skrivne tiltak</h3>}
            <ul className="sm-tiltak">
              {o.actions.slice(0, 6).map((a) => (
                <li key={a.question}>
                  <Tal n={a.clients} of={of} />
                  <span className="sm-tiltak-tekst">
                    <b>{a.texts[0]?.text}</b>
                    <span>{questionsText(o, [a.question])}</span>
                    {a.texts.length > 1 && (
                      <details className="sm-ordlag">
                        <summary>{a.texts.length} ulike formuleringar</summary>
                        <ul>
                          {a.texts.map((t) => (
                            <li key={t.text}>
                              {t.text} <span className="muted">· {t.clients}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </span>
                  {seminarTopic(a.clients, of) ? (
                    <span className="chip accent">Seminartema?</span>
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
