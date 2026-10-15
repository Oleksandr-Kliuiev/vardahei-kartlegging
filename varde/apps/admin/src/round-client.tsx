import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, mutate } from './api.js';
import type { Invitation, RoundClient } from './models.js';
import { ErrorMessage, useAction } from './queries.js';

export function SendOut({ id }: { id: string }) {
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
  return (
    <div className="utsending">
      <p>
        Teksten er skriven for at leiaren sender han frå si eiga e-post eller i Teams. Fortel gjerne
        om undersøkinga på eit møte først, så ingen trur det er svindel.
      </p>
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
          <textarea readOnly aria-label="Tekst til tilsette" value={invitation.data.text} />
          <input readOnly aria-label="Lenkje til kartlegginga" value={invitation.data.link} />
          <div className="knappar">
            <button
              onClick={() => {
                void copy(invitation.data.text);
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
  closed: 'Stengd',
  archived: 'Arkivert',
};

export function RoundClientCard({ rc }: { rc: RoundClient }) {
  const action = useAction();
  const [confirm, setConfirm] = useState(false);
  const [send, setSend] = useState(false);
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
    <article className="kunde-kort" aria-label={rc.client.name}>
      <div className="knappar">
        <h3>{rc.client.name}</h3>
        <span className="status">{statusText[rc.status] ?? rc.status}</span>
        <span>
          {rc.population_snapshot === null
            ? 'Tal tilsette er ikkje sett'
            : `${rc.population_snapshot} tilsette i denne runden`}
        </span>
      </div>
      <div className="knappar">
        {rc.status === 'draft' && (
          <button disabled={action.isPending} onClick={() => run(() => mutate(`${base}/open`))}>
            Opne
          </button>
        )}
        {rc.status === 'open' && (
          <button disabled={action.isPending} onClick={() => run(() => mutate(`${base}/close`))}>
            Steng
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
            {confirm ? 'Gamle lenkjer sluttar å verke. Stadfest' : 'Ny kode'}
          </button>
        )}
        {rc.status === 'open' && (
          <button
            aria-expanded={send}
            onClick={() => {
              setSend(!send);
            }}
          >
            Send ut
          </button>
        )}
      </div>
      <ErrorMessage error={action.error} />
      {send && rc.status === 'open' && <SendOut id={rc.id} />}
    </article>
  );
}
