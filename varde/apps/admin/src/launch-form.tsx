import { useState, type FormEvent } from 'react';
import { mutate } from './api.js';
import { Kundeval } from './kundeval.js';
import { versionText, type Client, type Version } from './models.js';
import { ErrorMessage, useAction } from './queries.js';
import { SendOut } from './round-client.js';

/**
 * The round wizard (1d), the one way to start a round (2.17): with clients it creates and may open
 * them in one step; without clients it makes a round that is not opened, to fill client by client.
 * With `seminar` (3.8) it starts the survey after that seminar: the seminar's clients are chosen,
 * and the new round becomes its «Etter» in the same step.
 */
export function LaunchForm({
  clients,
  versions,
  seminar,
  version,
  onLaunched,
  onCreated,
}: {
  clients: Client[];
  versions: Version[];
  seminar?: { id: string; topic: string };
  /** The published version to start from («Start ein runde med v3» in the workshop). */
  version?: string | undefined;
  onLaunched?: () => void;
  /** The round page takes over (its «Utsending» has the invitations); without it they show here. */
  onCreated?: (id: string, open: boolean) => void;
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    seminar ? clients.map((c) => c.id) : [],
  );
  // The deadline and head count of each picked client live here, not in the form: a client the
  // search or a tag filter hides keeps what was written for it, and nothing is sent half-filled.
  const [each, setEach] = useState<Record<string, { deadline: string; count: string }>>({});
  const [launched, setLaunched] = useState<{ id: string; name: string }[]>([]);
  const action = useAction();
  const empty = !seminar && selected.length === 0;
  const detail = (id: string) =>
    each[id] ?? {
      deadline: '',
      count: String(clients.find((c) => c.id === id)?.employee_count ?? ''),
    };
  const set = (id: string, part: Partial<{ deadline: string; count: string }>) =>
    setEach((was) => ({ ...was, [id]: { ...detail(id), ...part } }));
  /** Picked, but still without a deadline — the round cannot start before they have one. */
  const missing = selected.filter((id) => detail(id).deadline === '');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    action.mutate(async () => {
      if (empty) {
        const round = await mutate<{ id: string }>('/api/admin/rounds', 'POST', {
          name: form.get('name'),
          template_version_id: form.get('version'),
        });
        onCreated?.(round.id, false);
        return;
      }
      const result = await mutate<{ id: string; round_client_ids: string[]; status: string }>(
        '/api/admin/rounds/launch',
        'POST',
        {
          name: form.get('name'),
          template_version_id: form.get('version'),
          open: form.has('open'),
          clients: selected.map((id) => ({
            client_id: id,
            deadline: detail(id).deadline,
            population_snapshot: detail(id).count === '' ? null : Number(detail(id).count),
          })),
          ...(seminar ? { seminar: seminar.id } : {}),
        },
      );
      setSelected([]);
      setEach({});
      onLaunched?.();
      if (onCreated) {
        onCreated(result.id, result.status === 'open');
        return;
      }
      setLaunched(
        result.status === 'open'
          ? result.round_client_ids.map((id, i) => ({
              id,
              name: clients.find((c) => c.id === selected[i])?.name ?? '',
            }))
          : [],
      );
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
          <select name="version" required defaultValue={version ?? ''}>
            <option value="">Vel publisert versjon</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {versionText(v)}
              </option>
            ))}
          </select>
        </label>
        <Kundeval
          clients={clients}
          chosen={selected}
          onChange={setSelected}
          legend={seminar ? 'Kundar på seminaret' : 'Kundar i runden'}
          extra={(c) => (
            <>
              <label>
                Frist for {c.name}
                <input
                  type="date"
                  required
                  value={detail(c.id).deadline}
                  onChange={(e) => set(c.id, { deadline: e.target.value })}
                />
              </label>
              <label>
                Tilsette i runden for {c.name}
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={detail(c.id).count}
                  onChange={(e) => set(c.id, { count: e.target.value })}
                />
              </label>
            </>
          )}
        />
        {missing.length > 0 && (
          <p className="forklaring" role="status">
            {missing.length === 1
              ? 'Ein vald kunde manglar'
              : `${missing.length} valde kundar manglar`}{' '}
            frist:{' '}
            {missing
              .slice(0, 3)
              .map((id) => clients.find((c) => c.id === id)?.name)
              .join(', ')}
            {missing.length > 3 ? ' og fleire' : ''}.
          </p>
        )}
        {!empty && (
          <label>
            <input type="checkbox" name="open" />
            Opne med ein gong
          </label>
        )}
        <button
          disabled={action.isPending || (!!seminar && !selected.length) || missing.length > 0}
        >
          {seminar ? 'Start undersøkinga' : empty ? 'Opprett runden utan kundar' : 'Start runden'}
        </button>
        {empty && (
          <p className="forklaring">
            Utan kundar blir runden oppretta, men ikkje opna. Legg til kundane ein for ein, med eiga
            frist, på sida til runden.
          </p>
        )}
        {seminar && !selected.length && (
          <p className="forklaring">Vel minst éin kunde for å starte.</p>
        )}
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
