// «Skjema» (2.16): the library of surveys by their titles, and «Nytt skjema» from a start for each
// kind (decisions 3, 5 and 6 of 17.10). A card opens the survey's draft when there is one, else its
// newest version; the workshop does the rest.
import { useState, type FormEvent, type MouseEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, mutate } from './api.js';
import { Icon, type IconName } from './icons.js';
import { goTo } from './nav.js';
import { longDate } from './overview.js';
import { ErrorMessage } from './queries.js';
import { useToast } from './shell.js';
import {
  AUDIENCE,
  type EditorVersion,
  type SurveySummary,
  type TrashedDraft,
} from './survey-models.js';
import './bibliotek.css';

const LANGS: Record<string, string> = { nn: 'Nynorsk', en: 'English', nb: 'Bokmål' };
const open = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
  if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  goTo(`/admin/surveys/${id}`);
};

export function SurveysPage() {
  const surveys = useQuery({
    queryKey: ['surveys'],
    queryFn: () => api<SurveySummary[]>('/api/admin/surveys'),
  });
  const trash = useQuery({
    queryKey: ['surveys', 'trash'],
    queryFn: () => api<TrashedDraft[]>('/api/admin/surveys/trash'),
  });
  const [making, setMaking] = useState(false);
  const [view, setView] = useState<'skjema' | 'papirkorg'>('skjema');
  const list = [...(surveys.data ?? [])].sort((a, b) =>
    (a.title ?? a.key).localeCompare(b.title ?? b.key, 'nn'),
  );
  const trashed = trash.data ?? [];
  return (
    <>
      <div className="bib-topp">
        <p className="bib-tal" role="status">
          {view === 'papirkorg'
            ? trash.data
              ? `${trashed.length} sletta utkast`
              : 'Hentar papirkorga …'
            : surveys.data
              ? `${list.length} skjema`
              : 'Hentar skjema …'}
        </p>
        <div className="bib-topp-handlingar">
          {view === 'papirkorg' ? (
            <button type="button" className="btn" onClick={() => setView('skjema')}>
              Tilbake til skjema
            </button>
          ) : (
            <>
              {trashed.length > 0 && (
                <button type="button" className="btn ghost" onClick={() => setView('papirkorg')}>
                  <Icon name="slett" small />
                  Papirkorg ({trashed.length})
                </button>
              )}
              {!making && (
                <button type="button" className="btn primary" onClick={() => setMaking(true)}>
                  <Icon name="pluss" small />
                  Nytt skjema
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {view === 'skjema' && making && (
        <NyttSkjema surveys={list} onClose={() => setMaking(false)} />
      )}
      <ErrorMessage error={view === 'papirkorg' ? trash.error : surveys.error} />
      {view === 'skjema' ? (
        <ul className="bib-rutenett">
          {list.map((s) => (
            <li key={s.id}>
              <Kort s={s} />
            </li>
          ))}
        </ul>
      ) : (
        <Papirkorg items={trashed} loaded={!!trash.data} />
      )}
    </>
  );
}

function Papirkorg({ items, loaded }: { items: TrashedDraft[]; loaded: boolean }) {
  if (loaded && !items.length)
    return (
      <p className="bib-tom">
        Papirkorga er tom. Utkast du slettar, ligg her til du hentar dei attende eller slettar dei
        for godt.
      </p>
    );
  return (
    <ul className="bib-korg">
      {items.map((t) => (
        <li key={t.id}>
          <KorgRad t={t} />
        </li>
      ))}
    </ul>
  );
}

function KorgRad({ t }: { t: TrashedDraft }) {
  const queries = useQueryClient();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(work: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError('');
    try {
      await work();
      void queries.invalidateQueries({ queryKey: ['surveys'] });
      toast(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Noko gjekk gale. Prøv igjen.');
      setBusy(false);
    }
  }
  return (
    <div className="bib-korg-rad">
      <div className="bib-korg-tekst">
        <span className="bib-type">{AUDIENCE[t.audience] ?? t.audience}</span>
        <span className="bib-namn">{t.title}</span>
        <span className="bib-meta">
          <span className="chip warn">Utkast v{t.version_no}</span> {t.question_count} spørsmål ·
          sletta {longDate(new Date(t.deleted_at))}
          {t.deleted_by ? ` av ${t.deleted_by}` : ''}
        </span>
      </div>
      <div className="bib-korg-handling">
        {asking ? (
          <>
            <button
              type="button"
              className="btn sm fare"
              disabled={busy}
              onClick={() =>
                void run(
                  () => mutate(`/api/admin/surveys/trash/${t.id}`, 'DELETE'),
                  `«${t.title}» er sletta for godt.`,
                )
              }
            >
              <Icon name="slett" small />
              Slett for godt
            </button>
            <button
              type="button"
              className="btn sm ghost"
              disabled={busy}
              onClick={() => setAsking(false)}
            >
              Avbryt
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn sm"
              disabled={busy || !t.can_restore}
              onClick={() =>
                void run(
                  () => mutate(`/api/admin/surveys/versions/${t.id}/restore`),
                  `«${t.title}» er henta attende.`,
                )
              }
            >
              <Icon name="angre" small />
              Hent attende
            </button>
            <button
              type="button"
              className="btn sm ghost fare"
              disabled={busy}
              onClick={() => setAsking(true)}
            >
              <Icon name="slett" small />
              Slett for godt
            </button>
          </>
        )}
      </div>
      {asking && (
        <p className="bib-korg-sporsmal" role="status">
          Slette for godt? Utkastet blir borte for alltid.
        </p>
      )}
      {!t.can_restore && !asking && (
        <p className="bib-korg-note">
          Skjemaet har alt eit anna utkast. Slett eller publiser det for å hente dette attende.
        </p>
      )}
      {error && (
        <p role="alert" className="bib-korg-feil">
          {error}
        </p>
      )}
    </div>
  );
}

function Kort({ s }: { s: SurveySummary }) {
  const queries = useQueryClient();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const newest = s.versions.find((v) => v.status === 'published');
  const target = s.draft?.id ?? s.versions[0]?.id;
  if (!target) return null;
  const rounds = s.rounds ?? 0;
  const only = s.versions.length === 1;
  const title = s.title ?? s.key;
  async function discard(id: string) {
    setBusy(true);
    setError('');
    try {
      // The server wants the hash of the saved draft, so nobody deletes one that was changed meanwhile.
      const v = await api<EditorVersion>(`/api/admin/surveys/versions/${id}`);
      await mutate(`/api/admin/surveys/versions/${id}`, 'DELETE', { content_hash: v.content_hash });
      void queries.invalidateQueries({ queryKey: ['surveys'] });
      toast(`«${title}» er flytta til papirkorga.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikkje slette utkastet.');
      setBusy(false);
    }
  }
  return (
    <div className="bib-kortvegg">
      <a
        className={s.draft ? 'bib-kort har-utkast' : 'bib-kort'}
        href={`/admin/surveys/${target}`}
        onClick={(e) => open(e, target)}
      >
        <span className="bib-type">{AUDIENCE[s.audience] ?? s.audience}</span>
        <span className="bib-namn">{title}</span>
        <span className="bib-meta">
          {s.question_count ?? 0} spørsmål ·{' '}
          {(s.languages ?? []).map((l) => LANGS[l] ?? l).join(', ')}
          {' · '}
          {rounds
            ? `Brukt i ${rounds} ${rounds === 1 ? 'runde' : 'rundar'}`
            : 'Ikkje brukt i rundar'}
        </span>
        <span className="bib-status">
          {s.draft ? (
            <>
              <span className="chip warn">Utkast v{s.draft.version_no}</span>
              {s.draft.left ? `${s.draft.left} ting att før publisering` : 'Klar til publisering'}
            </>
          ) : newest ? (
            <>
              <span className="chip ok">Publisert v{newest.version_no}</span>
              {newest.published_at ? longDate(new Date(newest.published_at)) : ''}
            </>
          ) : null}
        </span>
      </a>
      {s.draft && !asking && (
        <button
          type="button"
          className="ikonknapp bib-slett"
          aria-label={`Slett utkastet til ${title}`}
          title="Slett utkastet"
          onClick={() => setAsking(true)}
        >
          <Icon name="slett" small />
        </button>
      )}
      {s.draft && asking && (
        <div className="bib-sporsmal" role="group" aria-label={`Stadfest sletting for ${title}`}>
          <p>
            {only
              ? 'Utkastet er den einaste versjonen, så heile skjemaet blir borte frå lista.'
              : `Utkastet v${s.draft.version_no} blir sletta. Publiserte versjonar og rundar blir ikkje rørt.`}{' '}
            Du finn det att i papirkorga.
          </p>
          {error && (
            <p role="alert" className="bib-feil">
              {error}
            </p>
          )}
          <div className="bib-sporsmal-knappar">
            <button
              type="button"
              className="btn sm fare"
              disabled={busy}
              onClick={() => void discard(s.draft!.id)}
            >
              <Icon name="slett" small />
              {only ? 'Slett skjemaet' : `Slett utkastet v${s.draft.version_no}`}
            </button>
            <button
              type="button"
              className="btn sm ghost"
              disabled={busy}
              onClick={() => {
                setAsking(false);
                setError('');
              }}
            >
              Avbryt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type Start = 'client_survey' | 'seminar_live' | 'seminar_after' | 'copy';
const STARTS: { id: Start; title: string; text: string; icon: IconName }[] = [
  {
    id: 'client_survey',
    title: 'Undersøking hos kundar',
    text: 'Med eller utan initialar, del for leiarar, risiko og råd. Nynorsk og engelsk.',
    icon: 'folk',
  },
  {
    id: 'seminar_live',
    title: 'Spørsmål på seminaret',
    text: 'Korte spørsmål som deltakarane svarar på medan seminaret går.',
    icon: 'graf',
  },
  {
    id: 'seminar_after',
    title: 'Etter seminaret',
    text: 'Kort og utan namn, etter seminaret.',
    icon: 'flagg',
  },
  {
    id: 'copy',
    title: 'Kopi av eit skjema',
    text: 'Startar frå den nyaste publiserte versjonen av eit skjema du har.',
    icon: 'kopi',
  },
];

function NyttSkjema({ surveys, onClose }: { surveys: SurveySummary[]; onClose: () => void }) {
  const queries = useQueryClient();
  const [start, setStart] = useState<Start>('client_survey');
  const [initials, setInitials] = useState(true);
  const [english, setEnglish] = useState(false);
  const copies = surveys.filter((s) => s.versions.some((v) => v.status === 'published'));
  const [copyOf, setCopyOf] = useState(copies[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const source = copies.find((s) => s.id === copyOf);
  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const field = new FormData(e.currentTarget).get('title');
    const title = typeof field === 'string' ? field.trim() : '';
    const published = source?.versions.find((v) => v.status === 'published');
    const body =
      start === 'copy'
        ? {
            title,
            audience: source?.audience ?? 'client_survey',
            identification: 'initials',
            required_languages: source?.languages ?? ['nn', 'en'],
            copy_from: published?.id,
          }
        : {
            title,
            audience: start,
            identification: start === 'client_survey' && initials ? 'initials' : 'none',
            required_languages: start === 'client_survey' || english ? ['nn', 'en'] : ['nn'],
          };
    setBusy(true);
    setError(null);
    mutate<EditorVersion>('/api/admin/surveys', 'POST', body)
      .then((v) => {
        void queries.invalidateQueries({ queryKey: ['surveys'] });
        goTo(`/admin/surveys/${v.id}`);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err : new Error('Noko gjekk gale.')))
      .finally(() => setBusy(false));
  }
  return (
    <section className="del bib-ny" aria-labelledby="bib-ny-tittel">
      <h2 id="bib-ny-tittel">Nytt skjema</h2>
      <form onSubmit={create}>
        <fieldset className="bib-startar">
          <legend>Kva slags skjema?</legend>
          {STARTS.map((s) => (
            <label key={s.id} className="bib-start">
              <input
                type="radio"
                name="start"
                value={s.id}
                checked={start === s.id}
                disabled={s.id === 'copy' && !copies.length}
                onChange={() => setStart(s.id)}
              />
              <span className="bib-start-ikon" aria-hidden="true">
                <Icon name={s.icon} small />
              </span>
              <span className="bib-start-tekst">
                <b>{s.title}</b>
                <small>{s.text}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="bib-felt">
          {start === 'copy' && (
            <label>
              Kopi av
              <select className="input" value={copyOf} onChange={(e) => setCopyOf(e.target.value)}>
                {copies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title ?? s.key}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="bib-namnfelt">
            <label htmlFor="bib-namn">Namn på skjemaet</label>
            <input
              id="bib-namn"
              key={start === 'copy' ? `kopi-${copyOf}` : 'ny'}
              className="input"
              name="title"
              required
              maxLength={120}
              defaultValue={
                start === 'copy' && source ? `${source.title ?? source.key} (kopi)` : ''
              }
              aria-describedby="bib-namn-hint"
            />
            <small id="bib-namn-hint">Tittelen dei som svarar ser. Han kan endrast seinare.</small>
          </div>
          {start === 'client_survey' && (
            <fieldset className="bib-val">
              <legend>Identifikasjon</legend>
              <label>
                <input type="radio" checked={initials} onChange={() => setInitials(true)} />
                Med initialar
              </label>
              <label>
                <input type="radio" checked={!initials} onChange={() => setInitials(false)} />
                Utan namn
              </label>
            </fieldset>
          )}
          {(start === 'seminar_live' || start === 'seminar_after') && (
            <label className="bib-sjekk">
              <input
                type="checkbox"
                checked={english}
                onChange={(e) => setEnglish(e.target.checked)}
              />
              Òg på engelsk
            </label>
          )}
        </div>
        <ErrorMessage error={error} />
        <div className="knappar">
          <button type="submit" className="btn primary" disabled={busy}>
            Lag skjemaet
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Avbryt
          </button>
        </div>
      </form>
    </section>
  );
}
