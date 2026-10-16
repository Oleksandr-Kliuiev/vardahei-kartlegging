// Create or change a seminar (3.1): topic in nynorsk (English when the seminar has it), day and
// times in Norwegian time, place, format and the clients it is for.
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mutate } from './api.js';
import { ErrorMessage, useClients } from './queries.js';
import { bodyOf, type SeminarDraft } from './seminar-models.js';
import { Seg } from './widgets.js';

export function SeminarForm({
  initial,
  id,
  onSaved,
  onCancel,
}: {
  initial: SeminarDraft;
  id?: string;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const clients = useClients();
  const queries = useQueryClient();
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const set = <K extends keyof SeminarDraft>(key: K, value: SeminarDraft[K]) =>
    setD((old) => ({ ...old, [key]: value }));
  const english = d.languages.includes('en');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await mutate<{ id: string }>(
        id ? `/api/admin/seminars/${id}` : '/api/admin/seminars',
        id ? 'PUT' : 'POST',
        bodyOf(d),
      );
      await queries.invalidateQueries({ queryKey: ['seminars'] });
      onSaved(saved.id);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Noko gjekk gale.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="sem-form" onSubmit={(e) => void save(e)} aria-label={id ? 'Endre seminaret' : 'Nytt seminar'}>
      <fieldset disabled={busy}>
        <label className="field">
          <span>Tema</span>
          <input
            className="input"
            required
            maxLength={160}
            value={d.topic_nn}
            onChange={(e) => set('topic_nn', e.target.value)}
          />
        </label>
        <div className="field">
          <span>Språk på påmeldingssida</span>
          <label className="kryss">
            <input type="checkbox" checked disabled /> Nynorsk
          </label>
          <label className="kryss">
            <input
              type="checkbox"
              checked={english}
              onChange={(e) => set('languages', e.target.checked ? ['nn', 'en'] : ['nn'])}
            />{' '}
            English
          </label>
        </div>
        {english && (
          <label className="field">
            <span>Tema på engelsk</span>
            <input
              className="input"
              required
              maxLength={160}
              value={d.topic_en}
              onChange={(e) => set('topic_en', e.target.value)}
            />
          </label>
        )}
        <div className="sem-form-tid">
          <label className="field">
            <span>Dato</span>
            <input className="input" type="date" required value={d.date} onChange={(e) => set('date', e.target.value)} />
          </label>
          <label className="field">
            <span>Frå</span>
            <input className="input" type="time" required value={d.start} onChange={(e) => set('start', e.target.value)} />
          </label>
          <label className="field">
            <span>Til</span>
            <input className="input" type="time" required value={d.end} onChange={(e) => set('end', e.target.value)} />
          </label>
        </div>
        <p className="forklaring">Norsk tid. Påmeldinga stengjer når seminaret er slutt.</p>
        <div className="field">
          <span>Format</span>
          <Seg
            label="Format"
            value={d.format}
            options={[
              ['onsite', 'På staden'],
              ['digital', 'Digitalt'],
            ]}
            onChange={(v) => set('format', v)}
          />
        </div>
        <label className="field">
          <span>{d.format === 'digital' ? 'Kvar (til dømes Teams)' : 'Stad'}</span>
          <input
            className="input"
            required
            maxLength={200}
            value={d.place}
            onChange={(e) => set('place', e.target.value)}
          />
        </label>
        <div className="field">
          <span>Kundar</span>
          <div className="sem-kundar">
            {clients.data?.map((c) => (
              <label key={c.id} className="kryss">
                <input
                  type="checkbox"
                  checked={d.clients.includes(c.id)}
                  onChange={(e) =>
                    set(
                      'clients',
                      e.target.checked ? [...d.clients, c.id] : d.clients.filter((x) => x !== c.id),
                    )
                  }
                />{' '}
                {c.name}
              </label>
            ))}
          </div>
          <p className="forklaring">Dei som melder seg på, kan velje mellom desse eller skrive inn ei anna bedrift.</p>
        </div>
        <ErrorMessage error={error} />
        <div className="handlingar">
          <button type="submit" className="btn primary">
            {id ? 'Lagre endringane' : 'Lag seminaret'}
          </button>
          <button type="button" className="btn ghost" onClick={onCancel}>
            Avbryt
          </button>
        </div>
      </fieldset>
    </form>
  );
}
