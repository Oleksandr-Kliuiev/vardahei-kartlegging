// One seminar (Vardestien «Seminar»): what, when and where, then the tabs «Påmelding»,
// «Materiell», «Invitasjon», «Live» and «Før og etter». The participant list is personal data:
// it is shown only on request, and every read is written to the log.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { Icon } from './icons.js';
import { ErrorMessage } from './queries.js';
import { SeminarForm } from './seminar-form.js';
import {
  copy,
  draftOf,
  go,
  names,
  type Participant,
  perCompany,
  registered,
  type SeminarDetail,
  shortDate,
} from './seminar-models.js';
import { useToast } from './shell.js';
import { Seg } from './widgets.js';

type Tab = 'pamelding' | 'materiell' | 'invitasjon' | 'live' | 'etter';
const TABS: readonly (readonly [Tab, string])[] = [
  ['pamelding', 'Påmelding'],
  ['materiell', 'Materiell'],
  ['invitasjon', 'Invitasjon'],
  ['live', 'Live'],
  ['etter', 'Før og etter'],
];

function Registrations({ seminar }: { seminar: SeminarDetail }) {
  const toast = useToast();
  const [rows, setRows] = useState<Participant[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const show = async () => {
    setError(null);
    try {
      setRows((await api<{ rows: Participant[] }>(`/api/admin/seminars/${seminar.id}/registrations`)).rows);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Noko gjekk gale.'));
    }
  };
  const r = seminar.registrations;
  return (
    <div className="flate">
      <section className="kort s5">
        <div className="talkort">
          <span className="etikett">
            <Icon name="folk" small />
            Påmelde
          </span>
          <span className="stort" data-testid="pamelde">
            {r.total}
          </span>
          {r.companies.length > 0 && <span className="under">{perCompany(r)}</span>}
        </div>
        <div className="kort-innhald">
          <p className="forklaring">
            Namn og e-post ligg berre i påmeldinga, og påmeldinga blir sletta 90 dagar etter seminaret.
          </p>
          {seminar.link ? (
            <div className="handlingar">
              <button type="button" className="btn sm" onClick={() => copy(seminar.link!, toast, 'Lenkja er kopiert')}>
                <Icon name="kopi" small />
                Kopier lenkje til påmelding
              </button>
              <a className="btn sm ghost" href={seminar.link} target="_blank" rel="noopener noreferrer">
                Opne påmeldingssida
              </a>
            </div>
          ) : (
            <p className="forklaring">Adressa til Varde (PUBLIC_URL) er ikkje sett opp, så det finst inga lenkje enno.</p>
          )}
        </div>
      </section>
      <section className="kort s7">
        <div className="kort-hovud">
          <h2>Namneliste</h2>
          {rows === null && (
            <button type="button" className="btn sm" onClick={() => void show()} disabled={r.total === 0}>
              Vis namnelista
            </button>
          )}
        </div>
        <div className="kort-innhald">
          <ErrorMessage error={error} />
          {rows === null ? (
            <p className="forklaring">
              Lista har namn og e-post. Kvar gong nokon opnar ho, blir det skrive i loggen.
            </p>
          ) : rows.length === 0 ? (
            <p className="tom">Ingen har meldt seg på enno.</p>
          ) : (
            <div className="tabell-wrap">
              <table className="kompakt sem-pamelde">
                <thead>
                  <tr>
                    <th scope="col">Namn</th>
                    <th scope="col">Bedrift</th>
                    <th scope="col">E-post</th>
                    <th scope="col">Påmeld</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.email}>
                      <th scope="row">{p.name}</th>
                      <td>{p.company}</td>
                      <td>{p.email}</td>
                      <td>
                        {shortDate(p.registered_at)}
                        {p.lang === 'en' ? ' · English' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Later({ title, text }: { title: string; text: string }) {
  return (
    <div className="flate">
      <section className="kort planlagt s12">
        <div className="kort-innhald">
          <div className="eyebrow">Kjem i neste steg</div>
          <h2 className="sem-later">{title}</h2>
          <p className="forklaring">{text}</p>
        </div>
      </section>
    </div>
  );
}

export function SeminarView({ id }: { id: string }) {
  const seminar = useQuery({
    queryKey: ['seminars', 'one', id],
    queryFn: () => api<SeminarDetail>(`/api/admin/seminars/${id}`),
  });
  const [tab, setTab] = useState<Tab>('pamelding');
  const [editing, setEditing] = useState(false);
  const s = seminar.data;
  return (
    <>
      <a className="linkbtn sem-tilbake" href="/admin/seminars" onClick={(e) => go(e, '/admin/seminars')}>
        <Icon name="tilbake" small />
        Alle seminar
      </a>
      <ErrorMessage error={seminar.error} />
      {s && (
        <>
          <section className="kort sem-topp">
            <div className="kort-innhald">
              <div className="eyebrow">Seminar · {s.status === 'planned' ? 'planlagt' : 'gjennomført'}</div>
              <h2 className="sem-tittel">{s.topic_nn}</h2>
              <p className="sem-meta">
                {s.when} · {s.format === 'digital' ? `Digitalt, ${s.place}` : s.place}
                {s.clients.length > 0 && ` · ${names(s.clients.map((c) => c.name))}`} · {registered(s.registrations.total)}
              </p>
              {!editing && (
                <div className="handlingar">
                  <button type="button" className="btn sm" onClick={() => setEditing(true)}>
                    Endre
                  </button>
                </div>
              )}
              {editing && (
                <SeminarForm
                  id={s.id}
                  initial={draftOf(s)}
                  onCancel={() => setEditing(false)}
                  onSaved={() => setEditing(false)}
                />
              )}
            </div>
          </section>
          <div className="sem-faner">
            <Seg label="Del" value={tab} options={TABS} onChange={setTab} />
          </div>
          {tab === 'pamelding' && <Registrations seminar={s} />}
          {tab === 'materiell' && (
            <Later title="Materiell" text="Lysark og lenkjer som deltakarane ser på påmeldingssida etter seminaret." />
          )}
          {tab === 'invitasjon' && (
            <Later title="Invitasjon" text="Tekst, kalenderfil og plakat med QR-kode til å sende ut sjølv." />
          )}
          {tab === 'live' && (
            <Later title="Live-spørsmål" text="Spørsmål på mobilen under seminaret, med resultat på storskjermen." />
          )}
          {tab === 'etter' && (
            <Later title="Før og etter" text="Undersøkinga før og etter seminaret, med atterhald om kven som svarte." />
          )}
        </>
      )}
    </>
  );
}
