import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, mutate } from './api.js';
import type { Invitation, Progress, RoundClient } from './models.js';
import { follow } from './nav.js';
import { ErrorMessage, useAction } from './queries.js';
import { Ring } from './widgets.js';

/** A short reminder, built from the invitation link and the deadline (Varde itself sends nothing). */
export function reminderText(lang: string, link: string, deadline: string | null): string {
  const date = deadline
    ? new Date(deadline).toLocaleDateString(lang === 'en' ? 'en-GB' : 'nb-NO', {
        day: 'numeric',
        month: 'long',
      })
    : '';
  if (lang === 'en')
    return `A reminder to answer the survey${date ? ` before ${date}` : ''}. It only takes a few minutes.\n\n${link}`;
  return `Hugs å svare på undersøkinga${date ? ` innan ${date}` : ''}. Det tek berre nokre minutt.\n\n${link}`;
}

export function SendOut({
  id,
  deadline = null,
  first = 'invitation',
}: {
  id: string;
  deadline?: string | null;
  /** The text shown first: a link from «I dag» about a deadline asks for the reminder. */
  first?: 'invitation' | 'reminder';
}) {
  const [kind, setKind] = useState<'invitation' | 'reminder'>(first);
  const [lang, setLang] = useState('nn');
  const [message, setMessage] = useState('');
  const invitation = useQuery({
    queryKey: ['rounds', 'invitation', id, lang],
    queryFn: () => api<Invitation>(`/api/admin/round-clients/${id}/invitation?lang=${lang}`),
  });
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Kopiert');
    } catch {
      setMessage('Kunne ikkje kopiere. Merk teksten og kopier sjølv.');
    }
  }
  const shown =
    kind === 'reminder' && invitation.data
      ? reminderText(lang, invitation.data.link, deadline)
      : (invitation.data?.text ?? '');
  return (
    <div className="utsending">
      <p>
        Teksten er skriven for at leiaren sender han frå si eiga e-post eller i Teams. Fortel gjerne
        om undersøkinga på eit møte først, så ingen trur det er svindel.
      </p>
      <div className="knappar" role="group" aria-label="Type tekst">
        {(['invitation', 'reminder'] as const).map((k) => (
          <button
            key={k}
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              setMessage('');
            }}
          >
            {k === 'invitation' ? 'Invitasjon' : 'Påminning'}
          </button>
        ))}
      </div>
      <div className="knappar">
        {(invitation.data?.languages ?? ['nn', 'en']).map((code) => (
          <button
            key={code}
            aria-pressed={lang === code}
            onClick={() => {
              setLang(code);
              setMessage('');
            }}
          >
            {{ nn: 'Nynorsk', en: 'English', nb: 'Bokmål' }[code] ?? code}
          </button>
        ))}
      </div>
      <ErrorMessage error={invitation.error} />
      {invitation.data && (
        <>
          <textarea readOnly aria-label="Tekst til tilsette" value={shown} />
          <input readOnly aria-label="Lenkje til kartlegginga" value={invitation.data.link} />
          <div className="knappar">
            <button
              onClick={() => {
                void copy(shown);
              }}
            >
              Kopier tekst
            </button>
            <button
              onClick={() => {
                void copy(invitation.data.link);
              }}
            >
              Kopier lenkje
            </button>
            <a
              className="knapp"
              href={`/admin/poster/${id}?lang=${lang}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Plakat med QR-kode
            </a>
          </div>
        </>
      )}
      <p role="status">{message}</p>
    </div>
  );
}

const statusText: Record<string, string> = {
  draft: 'Ikkje opna',
  open: 'Open',
  closed: 'Stengd for svar',
  archived: 'Arkivert',
};
const statusChip: Record<string, string> = {
  draft: 'chip',
  open: 'chip ok',
  closed: 'chip warn',
  archived: 'chip',
};

export function RoundClientCard({
  rc,
  round,
  progress,
  reportReady = false,
  asked = false,
}: {
  rc: RoundClient;
  /** The round the client card belongs to (its report lives on the round page). */
  round: string;
  progress?: Progress | undefined;
  /** The round is closed and released snapshots exist for this client (5.1). */
  reportReady?: boolean;
  /** Opened from a deadline on «I dag»: the reminder is ready and the card comes into view. */
  asked?: boolean;
}) {
  const action = useAction();
  const [confirm, setConfirm] = useState(false);
  const [send, setSend] = useState(asked && rc.status === 'open');
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    if (asked) card.current?.scrollIntoView?.({ block: 'center' });
  }, [asked]);
  const report = `/admin/rounds/${round}/rapportar/${rc.id}`;
  useEffect(() => {
    if (!confirm) return;
    const timer = setTimeout(() => {
      setConfirm(false);
    }, 5000);
    return () => {
      clearTimeout(timer);
    };
  }, [confirm]);
  const base = `/api/admin/round-clients/${rc.id}`;
  const run = (work: () => Promise<unknown>) => {
    action.mutate(work);
  };
  return (
    <article className="kort kundekort" aria-label={rc.client.name} ref={card}>
      <div className="kundekort-topp">
        <div>
          <h3>{rc.client.name}</h3>
          <small>
            {rc.population_snapshot === null
              ? 'Tal tilsette er ikkje sett'
              : `${rc.population_snapshot} tilsette i denne runden`}
          </small>
        </div>
        <span className={statusChip[rc.status] ?? 'chip'}>
          {statusText[rc.status] ?? rc.status}
        </span>
      </div>
      <div className="kundekort-midt">
        <Ring
          value={progress?.responses_total ?? 0}
          max={rc.population_snapshot}
          label={
            rc.population_snapshot === null
              ? 'Oppslutning: tal tilsette er ikkje sett'
              : `Oppslutning: ${progress?.responses_total ?? 0} av ${rc.population_snapshot}`
          }
        />
        <dl>
          <dt>Svar</dt>
          <dd>{progress?.responses_total ?? 0}</dd>
          <dt>Siste svar</dt>
          <dd>{progress?.last_response_day?.slice(0, 10) ?? '–'}</dd>
        </dl>
      </div>
      <div className="knappar">
        {rc.status === 'draft' && (
          <button disabled={action.isPending} onClick={() => run(() => mutate(`${base}/open`))}>
            Opne
          </button>
        )}
        {rc.status === 'open' && (
          <button disabled={action.isPending} onClick={() => run(() => mutate(`${base}/close`))}>
            Steng for svar
          </button>
        )}
        <label>
          Frist{' '}
          <input
            key={rc.deadline}
            type="date"
            aria-label={`Frist for ${rc.client.name}`}
            defaultValue={rc.deadline?.slice(0, 10) ?? ''}
            disabled={!['draft', 'open'].includes(rc.status) || action.isPending}
            onChange={(e) => {
              if (e.target.value)
                run(() => mutate(`${base}/deadline`, 'PATCH', { deadline: e.target.value }));
            }}
          />
        </label>
        {rc.status === 'open' && (
          <button
            className="fare"
            disabled={action.isPending}
            onClick={() => {
              if (!confirm) {
                setConfirm(true);
                return;
              }
              setConfirm(false);
              run(() => mutate(`${base}/reissue`));
            }}
          >
            {confirm ? 'Gamle lenkjer sluttar å verke. Stadfest' : 'Ny lenkje'}
          </button>
        )}
        {reportReady && (
          <a className="knapp" href={report} onClick={(e) => follow(e, report)}>
            Rapport til kunden
          </a>
        )}
        {rc.status === 'open' && (
          <button
            aria-expanded={send}
            title="Varde sender ingenting sjølv. Du får teksten og lenkja, og leiaren hos kunden sender dei."
            onClick={() => {
              setSend(!send);
            }}
          >
            Hent invitasjon
          </button>
        )}
      </div>
      <ErrorMessage error={action.error} />
      {send && rc.status === 'open' && (
        <SendOut
          id={rc.id}
          deadline={rc.deadline ?? null}
          first={asked ? 'reminder' : 'invitation'}
        />
      )}
    </article>
  );
}
