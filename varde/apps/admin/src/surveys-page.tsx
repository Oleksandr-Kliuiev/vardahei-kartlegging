import { useState, type FormEvent, type MouseEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, mutate } from './api.js';
import { ErrorMessage } from './queries.js';
import type { EditorVersion } from './survey-models.js';
import { goTo } from './nav.js';

interface Survey {
  id: string;
  key: string;
  audience: string;
  versions: { id: string; label: string; version_no: number; status: string }[];
}
export function SurveysPage() {
  const client = useQueryClient(),
    surveys = useQuery({
      queryKey: ['surveys'],
      queryFn: () => api<Survey[]>('/api/admin/surveys'),
    });
  const [error, setError] = useState<Error | null>(null),
    [busy, setBusy] = useState(false);
  const [audience, setAudience] = useState('client_survey');
  const [english, setEnglish] = useState(true);
  const changed = () => {
    void client.invalidateQueries({ queryKey: ['surveys'] });
    void client.invalidateQueries({ queryKey: ['rounds'] });
  };
  function work(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    void fn()
      .catch((e: unknown) => setError(e instanceof Error ? e : new Error('Noko gjekk gale.')))
      .finally(() => setBusy(false));
  }
  const open = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    goTo(`/admin/surveys/${id}`);
  };
  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    work(async () => {
      const v = await mutate<EditorVersion>('/api/admin/surveys', 'POST', {
        key: data.get('key'),
        audience,
        identification: data.get('identification'),
        required_languages: [
          'nn',
          ...(audience === 'client_survey' || data.has('en') ? ['en'] : []),
          ...(data.has('nb') ? ['nb'] : []),
        ],
      });
      changed();
      goTo(`/admin/surveys/${v.id}`);
    });
  }
  return (
    <>
      <ErrorMessage error={error ?? surveys.error} />
      <div className="kort-rutenett">
        <section className="del">
          <h2>Nytt skjema</h2>
          <form className="editor-form" onSubmit={create}>
            <label>
              Nøkkel
              <input name="key" required pattern="[a-z0-9_-]+" maxLength={100} />
            </label>
            <label>
              Målgruppe
              <select
                aria-label="Målgruppe"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
              >
                <option value="client_survey">Kundeskjema</option>
                <option value="seminar_live">Under seminar</option>
                <option value="seminar_after">Etter seminar</option>
              </select>
            </label>
            <div className="knappar">
              <span>Nynorsk (obligatorisk)</span>
              <label>
                <input
                  type="checkbox"
                  name="en"
                  checked={audience === 'client_survey' || english}
                  onChange={(e) => setEnglish(e.target.checked)}
                  disabled={audience === 'client_survey'}
                />
                Engelsk
              </label>
              <label>
                <input type="checkbox" name="nb" />
                Bokmål
              </label>
            </div>
            <label>
              Identifikasjon
              <select name="identification" aria-label="Identifikasjon">
                <option value="initials">Initialar</option>
                <option value="none">Anonym</option>
              </select>
            </label>
            <button disabled={busy}>Opprett skjema</button>
          </form>
        </section>
        {surveys.data?.map((s) => {
          // One draft per survey (decision 17.10): open it, or make the next one from the newest version.
          const draft = s.versions.find((v) => v.status === 'draft');
          const newest = s.versions
            .filter((v) => v.status === 'published')
            .sort((a, b) => b.version_no - a.version_no)[0];
          const next = Math.max(0, ...s.versions.map((v) => v.version_no)) + 1;
          return (
            <section className="del" key={s.id}>
              <h2>{s.key}</h2>
              <ul className="skjema-versjonar">
                {s.versions.map((v) => (
                  <li key={v.id}>
                    <a
                      className="knapp"
                      href={`/admin/surveys/${v.id}`}
                      onClick={(e) => open(e, v.id)}
                    >
                      {v.label === `v${v.version_no}` ? '' : `${v.label} · `}v{v.version_no} ·{' '}
                      {v.status === 'published' ? 'Publisert' : 'Utkast'}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="knappar">
                {draft ? (
                  <a
                    className="btn sm primary"
                    href={`/admin/surveys/${draft.id}`}
                    onClick={(e) => open(e, draft.id)}
                  >
                    Opne utkastet v{draft.version_no}
                  </a>
                ) : (
                  newest && (
                    <button
                      type="button"
                      className="btn sm primary"
                      disabled={busy}
                      onClick={() =>
                        work(async () => {
                          const made = await mutate<EditorVersion>(
                            `/api/admin/surveys/${s.id}/drafts`,
                            'POST',
                            { label: `v${next}`, copy_from: newest.id },
                          );
                          changed();
                          goTo(`/admin/surveys/${made.id}`);
                        })
                      }
                    >
                      Lag utkast v{next}
                    </button>
                  )
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
