// One seminar (Vardestien «Seminar»): what, when and where — the topic is the heading of the page
// and of its tab — the findings it takes up (2.17), then the tabs «Påmelding», «Materiell»,
// «Invitasjon», «Live» (3b) and «Før og etter» (3c: the rounds before, during and after, and the
// comparison). The participant list is personal data: it is shown only on request, and every read
// is written to the log.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, mutate } from './api.js';
import { Icon } from './icons.js';
import { useTitle } from './nav.js';
import { ErrorMessage } from './queries.js';
import { SeminarForm } from './seminar-form.js';
import { BeforeAfterTab } from './seminar-before-after.js';
import { SeminarFunn } from './seminar-funn.js';
import { Invitation } from './seminar-invitation.js';
import { Live } from './seminar-live.js';
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
import { SlettSeminar } from './seminar-delete.js';
import { Seg } from './widgets.js';

type Tab = 'pamelding' | 'materiell' | 'invitasjon' | 'live' | 'etter';
const TABS: readonly (readonly [Tab, string])[] = [
  ['pamelding', 'Påmelding'],
  ['materiell', 'Materiell'],
  ['invitasjon', 'Invitasjon'],
  ['live', 'Live'],
  ['etter', 'Før og etter'],
];

/** «Ny lenkje» (ADR-009) in two presses: the first says what stops working. */
function NewLink({ seminar }: { seminar: SeminarDetail }) {
  const toast = useToast();
  const queries = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (!confirm) return;
    const timer = setTimeout(() => setConfirm(false), 6000);
    return () => clearTimeout(timer);
  }, [confirm]);
  async function reissue() {
    setBusy(true);
    setError(null);
    try {
      await mutate(`/api/admin/seminars/${seminar.id}/reissue`);
      await queries.invalidateQueries({ queryKey: ['seminars'] });
      toast('Ny lenkje er laga');
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Noko gjekk gale.'));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }
  return (
    <div className="sem-ny-lenkje">
      <button
        type="button"
        className={confirm ? 'btn sm danger' : 'btn sm ghost'}
        disabled={busy}
        aria-describedby="ny-lenkje-varsel"
        onClick={() => (confirm ? void reissue() : setConfirm(true))}
      >
        {confirm ? 'Stadfest ny lenkje' : 'Ny lenkje'}
      </button>
      <p id="ny-lenkje-varsel" className={confirm ? 'forklaring sem-varsel' : 'forklaring'}>
        Den gamle lenkja sluttar å verke med ein gong: invitasjonar som er sende, plakatar som er
        skrivne ut og lenkja i kalenderen til dei påmelde. Del den nye lenkja etterpå.
      </p>
      <ErrorMessage error={error} />
    </div>
  );
}

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
            Påmeldinga blir sletta 90 dagar etter seminaret. Namn og e-post blir sletta samstundes,
            med mindre personen vil ha invitasjonar eller er påmeld eit anna seminar.
          </p>
          {seminar.link ? (
            <div className="handlingar">
              <button
                type="button"
                className="btn sm"
                onClick={() => copy(seminar.link!, toast, 'Lenkja er kopiert')}
              >
                <Icon name="kopi" small />
                Kopier lenkje til påmelding
              </button>
              <a
                className="btn sm ghost"
                href={seminar.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                Opne påmeldingssida
              </a>
            </div>
          ) : (
            <p className="forklaring">
              Adressa til Varde (PUBLIC_URL) er ikkje sett opp, så det finst inga lenkje enno.
            </p>
          )}
          {seminar.link && <NewLink seminar={seminar} />}
        </div>
      </section>
      <NameList seminar={seminar} />
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
  // A seminar that cannot be read keeps the heading and tab title of the section.
  const failed = !s && !!seminar.error;
  useTitle(s?.topic_nn ?? (failed ? 'Seminar' : undefined));
  return (
    <>
      <a
        className="linkbtn sem-tilbake"
        href="/admin/seminars"
        onClick={(e) => go(e, '/admin/seminars')}
      >
        <Icon name="tilbake" small />
        Alle seminar
      </a>
      {failed && <h1 className="sem-tittel">Seminar</h1>}
      <ErrorMessage error={seminar.error} />
      {s && (
        <>
          <section className="kort sem-topp">
            <div className="kort-innhald">
              <div className="eyebrow">
                Seminar · {s.status === 'planned' ? 'planlagt' : 'gjennomført'}
              </div>
              <h1 className="sem-tittel">{s.topic_nn}</h1>
              <p className="sem-meta">
                {s.when} · {s.format === 'digital' ? `Digitalt, ${s.place}` : s.place}
                {s.clients.length > 0 && ` · ${names(s.clients.map((c) => c.name))}`} ·{' '}
                {registered(s.registrations.total)}
              </p>
              {!editing && (
                <div className="handlingar">
                  <button type="button" className="btn sm" onClick={() => setEditing(true)}>
                    Endre
                  </button>
                  {s.status === 'planned' && <SlettSeminar s={s} />}
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
          <SeminarFunn seminar={s} />
          <div className="sem-faner">
            <Seg label="Del" value={tab} options={TABS} onChange={setTab} />
          </div>
          {tab === 'pamelding' && <Registrations seminar={s} />}
          {tab === 'materiell' && <Materials seminar={s} />}
          {tab === 'invitasjon' && <Invitation seminar={s} />}
          {tab === 'live' && <Live seminar={s} />}
          {tab === 'etter' && <BeforeAfterTab seminar={s} onLive={() => setTab('live')} />}
        </>
      )}
    </>
  );
}
