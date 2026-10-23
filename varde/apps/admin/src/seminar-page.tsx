// «Seminar» (3a, Vardestien «Seminar»): the list of seminars with registrations per company, a new
// seminar, how many contacts wait for the yearly check (under «Personvern»), and one seminar.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { Icon } from './icons.js';
import { follow } from './nav.js';
import { ErrorMessage } from './queries.js';
import { SlettSporsmal } from './seminar-delete.js';
import { SeminarForm } from './seminar-form.js';
import {
  emptyDraft,
  go,
  names,
  perCompany,
  registered,
  type Seminar,
  type SeminarList,
} from './seminar-models.js';
import { SeminarView } from './seminar-view.js';
import './seminar.css';

const MONTHS = [
  'jan.',
  'feb.',
  'mars',
  'apr.',
  'mai',
  'juni',
  'juli',
  'aug.',
  'sep.',
  'okt.',
  'nov.',
  'des.',
];

/** The yearly check of contacts lives under «Personvern» (2.17); the seminars show how many wait. */
function Contacts({ count }: { count: number }) {
  const to = '/admin/personvern/kontaktar';
  return (
    <section className="kort s4 sem-kontaktar">
      <div className="kort-hovud">
        <h2>Kontaktar</h2>
      </div>
      <div className="kort-innhald">
        <p>
          {count === 0
            ? 'Ingen kontaktar ventar på den årlege sjekken.'
            : `${count} ${count === 1 ? 'kontakt ventar' : 'kontaktar ventar'} på den årlege sjekken.`}
        </p>
        <a className="lenkje" href={to} onClick={(e) => follow(e, to)}>
          Personvern · Kontaktar
          <Icon name="pil" small />
        </a>
      </div>
    </section>
  );
}

function SeminarRow({ s }: { s: Seminar }) {
  const [asking, setAsking] = useState(false);
  const [, m = '1', d = '1'] = s.date.split('-');
  const planned = s.status === 'planned';
  if (asking) return <SlettSporsmal s={s} onCancel={() => setAsking(false)} />;
  return (
    <div className="sem-rad">
      <a
        className={planned ? 'har-slett' : undefined}
        href={`/admin/seminars/${s.id}`}
        onClick={(e) => go(e, `/admin/seminars/${s.id}`)}
      >
        <span className="sem-dato" aria-hidden="true">
          <b>{Number(d)}</b>
          <small>{MONTHS[Number(m) - 1]}</small>
        </span>
        <span className="sem-namn">
          <b>{s.topic_nn}</b>
          <small>
            {s.when} · {s.place}
          </small>
          {s.clients.length > 0 && <small>For {names(s.clients.map((c) => c.name))}</small>}
        </span>
        <span className="sem-tal">
          <span className={planned ? 'chip accent' : 'chip'}>
            {planned ? 'Planlagt' : 'Gjennomført'}
          </span>
          <small title={perCompany(s.registrations)}>{registered(s.registrations.total)}</small>
        </span>
      </a>
      {planned && (
        <button
          type="button"
          className="ikonknapp sem-slett"
          aria-label={`Slett seminaret ${s.topic_nn}`}
          title="Slett seminaret"
          onClick={() => setAsking(true)}
        >
          <Icon name="slett" small />
        </button>
      )}
    </div>
  );
}

function SeminarListPage() {
  const list = useQuery({
    queryKey: ['seminars', 'list'],
    queryFn: () => api<SeminarList>('/api/admin/seminars'),
  });
  const [creating, setCreating] = useState(false);
  const seminars = Array.isArray(list.data?.seminars) ? list.data.seminars : [];
  return (
    <div className="flate">
      {creating && (
        <section className="kort s12">
          <div className="kort-hovud">
            <h2>Nytt seminar</h2>
          </div>
          <div className="kort-innhald">
            <SeminarForm
              initial={emptyDraft()}
              onCancel={() => setCreating(false)}
              onSaved={(id) => {
                setCreating(false);
                go(null, `/admin/seminars/${id}`);
              }}
            />
          </div>
        </section>
      )}
      <section className="kort s8">
        <div className="kort-hovud">
          <h2>Alle seminar</h2>
          {!creating && (
            <button type="button" className="btn primary sm" onClick={() => setCreating(true)}>
              <Icon name="pluss" small />
              Nytt seminar
            </button>
          )}
        </div>
        <div className="kort-innhald">
          <ErrorMessage error={list.error} />
          {list.isSuccess && seminars.length === 0 && <p className="tom">Ingen seminar enno.</p>}
          <ul className="sem-liste">
            {seminars.map((s) => (
              <li key={s.id}>
                <SeminarRow s={s} />
              </li>
            ))}
          </ul>
        </div>
      </section>
      <Contacts count={list.data?.contacts_to_review ?? 0} />
    </div>
  );
}

export function SeminarPage({ id }: { id?: string | undefined }) {
  return id ? <SeminarView key={id} id={id} /> : <SeminarListPage />;
}
