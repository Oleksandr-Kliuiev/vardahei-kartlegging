// «Samtalar» on the client page (2.20), as in the concept: per round the day and the state, the bar of
// the scale with the score and the counts, and the way into the conversation (or to its round before it
// starts). Newest round first. With two finished ones, a line says how the latest compares (3.2).
import { follow } from './nav.js';
import { Icon } from './icons.js';
import { Fordeling } from './samtale-felt.js';
import { ForEtterLinje } from './samtale-for-etter.js';
import { dmy, type Status, STATUS, useClientInterviews } from './samtale-models.js';
import './samtale.css';

/** The state of one conversation: going on shows the live dot, finished the tick. */
function Tilstand({ status }: { status: Status }) {
  if (status === 'done')
    return (
      <span className="sm-status sm-status-ok">
        <Icon name="hake" small />
        {STATUS.done}
      </span>
    );
  if (status === 'in_progress')
    return (
      <span className="sm-status sm-status-pagar">
        <span className="live-dot" aria-hidden="true" />
        {STATUS.in_progress}
      </span>
    );
  return <span className="sm-status">{STATUS.planned}</span>;
}

export function KundeSamtalar({ client }: { client: string }) {
  const q = useClientInterviews(client);
  const list = Array.isArray(q.data) ? q.data : [];
  return (
    <section className="kort" aria-labelledby="kunde-samtalar">
      <div className="kort-hovud">
        <h2 id="kunde-samtalar">Samtalar</h2>
      </div>
      <div className="kort-innhald">
        {q.data && !list.length && <p className="muted">Ingen samtalar med nøkkelpersonar enno.</p>}
        <ForEtterLinje list={list} />
        <ul className="sm-kundesamtalar">
          {list.map((i) => {
            const planned = i.status === 'planned';
            const to = planned ? `/admin/samtalar?runde=${i.round.id}` : `/admin/samtalar/${i.id}`;
            return (
              <li key={i.id}>
                <p className="sm-kunde-linje">
                  <b>{i.round.name}</b>
                  {i.held_on && <span>{dmy(i.held_on)}</span>}
                  <Tilstand status={i.status} />
                </p>
                {!planned && (
                  <>
                    <Fordeling counts={i.counts} tall label={`Fordeling, ${i.round.name}`} />
                    <p className="sm-kunde-tal">
                      <span>
                        Poeng <b>{i.score ?? '–'}</b>
                      </span>
                      <span>
                        Manglar <b>{i.counts.manglar}</b>
                      </span>
                      <span>
                        Forbetringspotensial <b>{i.counts.forbetring}</b>
                      </span>
                      <span>
                        Ivaretatt <b>{i.counts.ivaretatt}</b>
                      </span>
                    </p>
                  </>
                )}
                <span className="handlingar">
                  <a
                    className={planned ? 'btn sm' : 'btn sm primary'}
                    href={to}
                    onClick={(e) => follow(e, to)}
                  >
                    {planned ? 'Til runda' : 'Opne samtalen'}
                  </a>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
