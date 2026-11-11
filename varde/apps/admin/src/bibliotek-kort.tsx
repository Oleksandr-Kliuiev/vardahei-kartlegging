// A survey's card in «Skjema» (2.16; moved out of surveys-page.tsx on 11.11): what it is, its versions, and
// the corner of icon buttons — rename it in Varde (11.11), copy it, move its draft to the trash, or delete
// a survey nobody uses whole (11.11).
import { useState, type FormEvent, type MouseEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, mutate } from './api.js';
import { Icon } from './icons.js';
import { goTo } from './nav.js';
import { longDate } from './overview.js';
import { useToast } from './shell.js';
import { AUDIENCE, type EditorVersion, type SurveySummary } from './survey-models.js';
import { HoldButton } from './widgets.js';

const LANGS: Record<string, string> = { nn: 'Nynorsk', en: 'English', nb: 'Bokmål' };
const open = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
  if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  goTo(`/admin/surveys/${id}`);
};

export function Kort({ s, onCopy }: { s: SurveySummary; onCopy: () => void }) {
  const queries = useQueryClient();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [naming, setNaming] = useState(false);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const newest = s.versions.find((v) => v.status === 'published');
  const target = s.draft?.id ?? s.versions[0]?.id;
  if (!target) return null;
  const rounds = s.rounds ?? 0;
  const only = s.versions.length === 1;
  const title = s.title ?? s.key;
  // A survey nobody uses can go whole, published versions too (11.11); one with only a draft goes to
  // the trash as before.
  const whole = !!newest && rounds === 0 && (s.interview_rounds ?? 0) === 0;
  async function removeAll() {
    setBusy(true);
    setError('');
    try {
      await mutate(`/api/admin/surveys/${s.id}`, 'DELETE');
      void queries.invalidateQueries({ queryKey: ['surveys'] });
      void queries.invalidateQueries({ queryKey: ['samtalar'] });
      toast(`«${title}» er sletta.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikkje slette skjemaet.');
      setBusy(false);
    }
  }
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
        // How many icon buttons sit in the corner, so the top line keeps clear of them (11.11).
        data-ikon={1 + (newest ? 1 : 0) + (s.draft || whole ? 1 : 0)}
        href={`/admin/surveys/${target}`}
        onClick={(e) => open(e, target)}
      >
        <span className="bib-type">{AUDIENCE[s.audience] ?? s.audience}</span>
        <span className="bib-namn">{title}</span>
        {/* A name given in Varde is not what respondents read: the card says so while they differ. */}
        {s.name && s.content_title && s.content_title !== s.name && (
          <span className="bib-tittel-kunde">Tittel i skjemaet: {s.content_title}</span>
        )}
        <span className="bib-meta">
          {s.question_count ?? 0} spørsmål ·{' '}
          {(s.languages ?? []).map((l) => LANGS[l] ?? l).join(', ')}
          {' · '}
          {rounds
            ? `Brukt i ${rounds} ${rounds === 1 ? 'runde' : 'rundar'}`
            : 'Ikkje brukt i rundar'}
        </span>
        {/* The published version is the one the clients answer, so it stays on the card while a
            draft is being written; the draft stands beside it with what is left. */}
        <span className="bib-status">
          {newest && (
            <>
              <span className="chip ok">Publisert v{newest.version_no}</span>
              {!s.draft && newest.published_at ? longDate(new Date(newest.published_at)) : ''}
            </>
          )}
          {s.draft && (
            <>
              <span className="chip warn">Utkast v{s.draft.version_no}</span>
              {s.draft.left ? `${s.draft.left} ting att før publisering` : 'Klar til publisering'}
            </>
          )}
        </span>
      </a>
      {!asking && !naming && (
        <div className="bib-kort-handlingar">
          <button
            type="button"
            className="ikonknapp"
            aria-label={`Endre namn på ${title}`}
            title="Endre namn"
            onClick={() => setNaming(true)}
          >
            <Icon name="blyant" small />
          </button>
          {newest && (
            <button
              type="button"
              className="ikonknapp"
              aria-label={`Lag ein kopi av ${title}`}
              title="Kopier skjemaet"
              onClick={onCopy}
            >
              <Icon name="kopi" small />
            </button>
          )}
          {(s.draft || whole) && (
            <button
              type="button"
              className="ikonknapp"
              aria-label={s.draft ? `Slett utkastet til ${title}` : `Slett ${title}`}
              title={s.draft ? 'Slett utkastet' : 'Slett skjemaet'}
              onClick={() => {
                setAll(!s.draft);
                setAsking(true);
              }}
            >
              <Icon name="slett" small />
            </button>
          )}
        </div>
      )}
      {naming && <EndreNamn s={s} title={title} onClose={() => setNaming(false)} />}
      {asking && (s.draft || whole) && (
        <div className="bib-sporsmal" role="group" aria-label={`Stadfest sletting for ${title}`}>
          {all || !s.draft ? (
            <p>
              Heile skjemaet blir sletta for godt, med{' '}
              {s.versions.length === 1
                ? 'den eine versjonen'
                : `alle ${s.versions.length} versjonane`}
              . Ingen runde brukar det. Det kan ikkje angrast.
            </p>
          ) : (
            <p>
              {only
                ? 'Utkastet er den einaste versjonen, så heile skjemaet blir borte frå lista.'
                : `Utkastet v${s.draft.version_no} blir sletta. Publiserte versjonar og rundar blir ikkje rørt.`}{' '}
              Du finn det att i papirkorga.
              {whole && (
                <>
                  {' '}
                  <button type="button" className="linkbtn" onClick={() => setAll(true)}>
                    Slett heile skjemaet i staden
                  </button>
                </>
              )}
            </p>
          )}
          {error && (
            <p role="alert" className="bib-feil">
              {error}
            </p>
          )}
          <div className="bib-sporsmal-knappar">
            {all || !s.draft ? (
              <HoldButton
                className="fare"
                label="Slett heile skjemaet"
                hint="Hald inne knappen i over eitt sekund. Skjemaet og alle versjonane blir borte."
                disabled={busy}
                onConfirm={() => void removeAll()}
              />
            ) : (
              <button
                type="button"
                className="btn sm fare"
                disabled={busy}
                onClick={() => void discard(s.draft!.id)}
              >
                <Icon name="slett" small />
                {only ? 'Slett skjemaet' : `Slett utkastet v${s.draft.version_no}`}
              </button>
            )}
            <button
              type="button"
              className="btn sm"
              disabled={busy}
              onClick={() => {
                setAsking(false);
                setAll(false);
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

/**
 * «Endre namn» (11.11): the survey's name in Varde, changed without a new version. The library, the round
 * pickers and «Samtalar» show it at once; respondents and clients keep the title of the published
 * version, which the form says. An empty field gives that title back.
 */
function EndreNamn({
  s,
  title,
  onClose,
}: {
  s: SurveySummary;
  title: string;
  onClose: () => void;
}) {
  const queries = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const id = `bib-nytt-namn-${s.id}`;
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await mutate<{ name: string | null }>(`/api/admin/surveys/${s.id}/name`, 'PUT', {
        name: name.trim() === (s.content_title ?? '') ? '' : name,
      });
      void queries.invalidateQueries({ queryKey: ['surveys'] });
      void queries.invalidateQueries({ queryKey: ['samtalar'] });
      toast(`Skjemaet heiter no «${r.name ?? s.content_title ?? s.key}».`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikkje endre namnet.');
      setBusy(false);
    }
  }
  return (
    <form
      className="bib-namnskjema"
      aria-label={`Endre namn på ${title}`}
      noValidate
      onSubmit={(e) => void save(e)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <label htmlFor={id}>Namn i Varde</label>
      <input
        id={id}
        className="input"
        value={name}
        maxLength={120}
        autoFocus
        aria-describedby={`${id}-hint`}
        onChange={(e) => setName(e.target.value)}
      />
      <p id={`${id}-hint`}>
        Ingen ny versjon.{' '}
        {s.content_title
          ? `Dei som svarar, ser framleis «${s.content_title}».`
          : 'Dei som svarar, ser tittelen i skjemaet.'}
      </p>
      {error && (
        <p role="alert" className="bib-feil">
          {error}
        </p>
      )}
      <div className="bib-sporsmal-knappar">
        <button type="submit" className="btn sm primary" disabled={busy || !name.trim()}>
          Lagre namnet
        </button>
        <button type="button" className="btn sm" disabled={busy} onClick={onClose}>
          Avbryt
        </button>
      </div>
    </form>
  );
}
