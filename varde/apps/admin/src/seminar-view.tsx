// One seminar (Vardestien «Seminar»): what, when and where, then the tabs «Påmelding»,
// «Materiell», «Invitasjon», «Live» and «Før og etter». The participant list is personal data:
// it is shown only on request, and every read is written to the log.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { Icon } from './icons.js';
import { ErrorMessage } from './queries.js';
import { SeminarForm } from './seminar-form.js';
import { Invitation } from './seminar-invitation.js';
import { Materials } from './seminar-materials.js';
import { NameList } from './seminar-participants.js';
import {
  copy,
  draftOf,
  go,
  names,
  perCompany,
  registered,
  type SeminarDetail,
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
  const r = seminar.registrations;
  return (
    <div className="flate">
      <section className="kort s4 sem-tal-kort">
        <div className="talkort">
          <span className="etikett">
            <Icon name="folk" small />
            Påmelde
          </span>
          <span className="stort" data-testid="pamelde">
            {r.total}
          </span>
          {r.total > 0 && <span className="under">{perCompany(r)}</span>}
          <p className="forklaring">
            Påmeldinga blir sletta 90 dagar etter seminaret. Namn og e-post ligg i kontaktlista til den
            årlege sjekken eller til du slettar dei.
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
      <NameList seminar={seminar} />
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
          {tab === 'materiell' && <Materials seminar={s} />}
          {tab === 'invitasjon' && <Invitation seminar={s} />}
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
