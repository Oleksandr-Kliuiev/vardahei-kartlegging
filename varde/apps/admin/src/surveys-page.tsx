import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, mutate } from './api.js';
import { ErrorMessage } from './queries.js';
import { SurveyEditor } from './survey-editor.js';
import type { EditorVersion } from './survey-models.js';

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
  const [version, setVersion] = useState<EditorVersion | null>(null),
    [error, setError] = useState<Error | null>(null),
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
      setVersion(v);
      changed();
    });
  }
  return (
    <>
      <ErrorMessage error={error ?? surveys.error} />
      <section className="del">
        <h2>Nytt skjema</h2>
        <form className="editor-form" onSubmit={create}>
          <label>
            Nøkkel
            <input name="key" required pattern="[a-z0-9_-]+" maxLength={100} />
          </label>
          <label>
            Målgruppe
            <select aria-label="Målgruppe" value={audience} onChange={(e) => setAudience(e.target.value)}>
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
      {surveys.data?.map((s) => (
        <section className="del" key={s.id}>
          <h2>{s.key}</h2>
          <ul>
            {s.versions.map((v) => (
              <li key={v.id}>
                <button
                  disabled={busy}
                  onClick={() =>
                    work(async () =>
                      setVersion(await api<EditorVersion>(`/api/admin/surveys/versions/${v.id}`)),
                    )
                  }
                >
                  {v.label} · v{v.version_no} · {v.status === 'published' ? 'Publisert' : 'Utkast'}
                </button>
              </li>
            ))}
          </ul>
          <form
            className="knappar"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              work(async () => {
                setVersion(
                  await mutate<EditorVersion>(`/api/admin/surveys/${s.id}/drafts`, 'POST', {
                    label: data.get('label'),
                    ...(data.get('copy') ? { copy_from: data.get('copy') } : {}),
                  }),
                );
                changed();
              });
            }}
          >
            <label>
              Namn på utkast
              <input name="label" required maxLength={100} />
            </label>
            <label>
              Utgangspunkt
              <select name="copy">
                <option value="">Tomt utkast</option>
                {s.versions
                  .filter((v) => v.status === 'published')
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      Kopi av {v.label}
                    </option>
                  ))}
              </select>
            </label>
            <button disabled={busy}>Nytt utkast</button>
          </form>
        </section>
      ))}
      {version && <SurveyEditor key={version.id} initial={version} changed={changed} />}
    </>
  );
}
