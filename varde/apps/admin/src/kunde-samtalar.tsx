// «Samtalar» on the client page (2.20): the client's conversations with key people, newest round first,
// with how far each has come and how it was rated.
import { follow } from './nav.js';
import { Icon } from './icons.js';
import { Fordeling } from './samtale-felt.js';
import { dmy, STATUS, useClientInterviews } from './samtale-models.js';
import './samtale.css';

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
        <ul className="sm-kundesamtalar">
          {list.map((i) => {
            const to =
              i.status === 'planned'
                ? `/admin/samtalar?runde=${i.round.id}`
                : `/admin/samtalar/${i.id}`;
            return (
              <li key={i.id}>
                <span className="sm-rundnamn">
                  <b>{i.round.name}</b>
                  <span>
                    {STATUS[i.status]}
                    {i.held_on ? ` · ${dmy(i.held_on)}` : ''}
                    {i.status === 'done' && i.score !== null ? ` · poeng ${i.score}` : ''}
                  </span>
                </span>
                {i.status !== 'planned' && <Fordeling counts={i.counts} label={i.round.name} />}
                <a className="lenkje" href={to} onClick={(e) => follow(e, to)}>
                  {i.status === 'planned' ? 'Til runda' : 'Opne samtalen'}
                  <Icon name="pil" small />
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
