import { useState, type FormEvent } from 'react';
import { mutate } from './api.js';
import type { Client, Version } from './models.js';
import { ErrorMessage, useAction } from './queries.js';
import { SendOut } from './round-client.js';

/** The round wizard (1d). With `seminar` (3.8) it starts the survey after that seminar: the
 * seminar's clients are chosen, and the new round becomes its «Etter» in the same step. */
export function LaunchForm({
  clients,
  versions,
  seminar,
  onLaunched,
}: {
  clients: Client[];
  versions: Version[];
  seminar?: { id: string; topic: string };
  onLaunched?: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    seminar ? clients.map((c) => c.id) : [],
  );
  const [launched, setLaunched] = useState<{ id: string; name: string }[]>([]);
  const action = useAction();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    action.mutate(async () => {
      const result = await mutate<{ round_client_ids: string[]; status: string }>(
        '/api/admin/rounds/launch',
        'POST',
        {
          name: form.get('name'),
          template_version_id: form.get('version'),
          open: form.has('open'),
          clients: selected.map((id) => ({
            client_id: id,
            deadline: form.get(`deadline-${id}`),
            population_snapshot:
              form.get(`count-${id}`) === '' ? null : Number(form.get(`count-${id}`)),
          })),
          ...(seminar ? { seminar: seminar.id } : {}),
        },
      );
      setLaunched(
        result.status === 'open'
          ? result.round_client_ids.map((id, i) => ({
              id,
              name: clients.find((c) => c.id === selected[i])?.name ?? '',
            }))
          : [],
      );
      setSelected([]);
      onLaunched?.();
    });
  }
  return (
    <section className="del start-runde">
      <h2>{seminar ? 'Undersøking etter seminaret' : 'Start ein runde'}</h2>
      {seminar && (
        <p className="under">
          Undersøkinga går til kundane på seminaret, med eiga lenkje for kvar kunde, og blir kopla
          til seminaret som «Etter». Vel same skjema som undersøkinga før, så kan svara
          samanliknast.
        </p>
      )}
      <form className="editor-form" onSubmit={submit}>
        <label>
          Namn på den nye runden{' '}
          <input
            required
            name="name"
            maxLength={200}
            defaultValue={seminar ? `Etter seminaret: ${seminar.topic}`.slice(0, 200) : undefined}
          />
        </label>
        <label>
          Versjon for den nye runden{' '}
          <select name="version" required>
            <option value="">Vel publisert versjon</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.template.key} · {v.label}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>{seminar ? 'Kundar på seminaret' : 'Kundar i runden'}</legend>
          <div className="knappar">
            <button type="button" onClick={() => setSelected(clients.map((c) => c.id))}>
              Vel alle
            </button>
            <button type="button" onClick={() => setSelected([])}>
              Vel ingen
            </button>
          </div>
          {clients.map((c) => (
            <div className="launch-client" key={c.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? [...selected, c.id] : selected.filter((id) => id !== c.id),
                    )
                  }
                />
                {c.name}
              </label>
              {selected.includes(c.id) && (
                <div className="knappar">
                  <label>
                    Frist for {c.name}
                    <input name={`deadline-${c.id}`} type="date" required />
                  </label>
                  <label>
                    Tilsette i runden for {c.name}
                    <input
                      name={`count-${c.id}`}
                      type="number"
                      min={1}
                      max={9999}
                      defaultValue={c.employee_count ?? ''}
                    />
                  </label>
                </div>
              )}
            </div>
          ))}
        </fieldset>
        <label>
          <input type="checkbox" name="open" />
          Opne med ein gong
        </label>
        <button disabled={action.isPending || !selected.length}>
          {seminar ? 'Start undersøkinga' : 'Start runden'}
        </button>
        <ErrorMessage error={action.error} />
      </form>
      {launched.length > 0 && (
        <div>
          <h3>Invitasjonar til den nye runden</h3>
          {launched.map(({ id, name }) => (
            <article key={id}>
              <h3>{name}</h3>
              <SendOut id={id} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
