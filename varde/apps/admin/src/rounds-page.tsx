import { useState, type FormEvent } from 'react';
import { mutate } from './api.js';
import type { Round, Client } from './models.js';
import {
  ErrorMessage,
  useAction,
  useAudit,
  useClients,
  useRounds,
  useVersions,
} from './queries.js';
import { LaunchForm } from './launch-form.js';
import { ClientForm } from './clients-form.js';
import { RoundClientCard } from './round-client.js';

function EmployeeCount({ client }: { client: Client }) {
  const action = useAction();
  return (
    <tr>
      <th scope="row">{client.name}</th>
      <td>
        <input
          key={client.employee_count}
          type="number"
          min="1"
          max="9999"
          placeholder="–"
          defaultValue={client.employee_count ?? ''}
          aria-label={`Tal tilsette i ${client.name}`}
          disabled={action.isPending}
          onChange={(e) => {
            if (!e.target.validity.valid) return;
            const employee_count = e.target.value === '' ? null : Number(e.target.value);
            action.mutate(() =>
              mutate(`/api/admin/clients/${client.id}`, 'PATCH', { employee_count }),
            );
          }}
        />
        <ErrorMessage error={action.error} />
      </td>
    </tr>
  );
}

function AddClient({ round, clients }: { round: Round; clients: Client[] }) {
  const [selected, setSelected] = useState('');
  const action = useAction();
  const available = clients.filter((c) => !round.round_clients.some((rc) => rc.client_id === c.id));
  if (!available.length) return null;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    action.mutate(
      () =>
        mutate(`/api/admin/rounds/${round.id}/clients`, 'POST', {
          client_id: form.get('client'),
          deadline: form.get('deadline'),
        }),
      {
        onSuccess: () => {
          setSelected('');
        },
      },
    );
  }
  return (
    <form className="knappar" onSubmit={submit}>
      <label>
        Kunde{' '}
        <select
          required
          aria-label="Kunde"
          name="client"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
          }}
        >
          <option value="">Vel kunde</option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Frist <input required name="deadline" type="date" />
      </label>
      <button disabled={action.isPending}>Legg til kunde</button>
      <ErrorMessage error={action.error} />
    </form>
  );
}

export function AuditLog() {
  const audit = useAudit();
  return (
    <section className="del">
      <h2>Siste hendingar</h2>
      <ErrorMessage error={audit.error} />
      <ol className="logg">
        {audit.data?.map((row, i) => (
          <li key={`${row.at}-${i}`}>
            <time dateTime={row.at}>{new Date(row.at).toLocaleString('nn-NO')}</time>{' '}
            <strong>{row.who}</strong> {row.what} <small>{row.target}</small>
          </li>
        ))}
      </ol>
      {audit.data?.length === 0 && <p>Ingenting har skjedd enno.</p>}
    </section>
  );
}

export function RoundsPage() {
  const clients = useClients(),
    rounds = useRounds(),
    versions = useVersions();
  const action = useAction();
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget,
      form = new FormData(element);
    action.mutate(
      () =>
        mutate('/api/admin/rounds', 'POST', {
          name: form.get('name'),
          template_version_id: form.get('version'),
        }),
      {
        onSuccess: () => {
          element.reset();
        },
      },
    );
  }
  return (
    <>
      <ErrorMessage error={clients.error ?? rounds.error ?? versions.error ?? action.error} />
      <section className="del">
        <h2>Kundar</h2>
        <p className="under">
          Talet på tilsette blir brukt i nye rundar. Rundar som alt er oppretta, held på sitt eige
          tal.
        </p>
        <table className="kompakt">
          <thead>
            <tr>
              <th>Kunde</th>
              <th>Tal tilsette</th>
            </tr>
          </thead>
          <tbody>
            {clients.data?.map((c) => (
              <EmployeeCount key={c.id} client={c} />
            ))}
          </tbody>
        </table>
      </section>
      <section className="del">
        <h2>Legg til eller endre kunde</h2>
        <ClientForm />
        {clients.data?.map((c) => (
          <details key={c.id}>
            <summary>Endre {c.name}</summary>
            <ClientForm key={`${c.name}-${c.employee_count}`} client={c} />
          </details>
        ))}
      </section>
      <LaunchForm clients={clients.data ?? []} versions={versions.data ?? []} />
      <section className="del">
        <h2>Ny tom runde</h2>
        <form className="knappar" onSubmit={create}>
          <label>
            Namn på runden <input required name="name" maxLength={200} />
          </label>
          <label>
            Publisert versjon{' '}
            <select required aria-label="Publisert versjon" name="version">
              <option value="">Vel versjon</option>
              {versions.data?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.template.key === 'tryggleik'
                    ? 'IT-tryggleik'
                    : v.template.key === 'ki'
                      ? 'KI i kvardagen'
                      : v.template.key}{' '}
                  · {v.label}
                </option>
              ))}
            </select>
          </label>
          <button disabled={action.isPending}>Opprett runde</button>
        </form>
      </section>
      {rounds.data?.map((round) => (
        <section className="del" key={round.id} aria-label={round.name}>
          <h2>{round.name}</h2>
          <p className="under">
            {round.status === 'draft'
              ? 'Ikkje opna'
              : round.status === 'open'
                ? 'Open'
                : 'Avslutta'}
          </p>
          {round.round_clients.map((rc) => (
            <RoundClientCard key={rc.id} rc={rc} />
          ))}
          {['draft', 'open'].includes(round.status) && (
            <AddClient round={round} clients={clients.data ?? []} />
          )}
          {round.status === 'open' && (
            <button
              className="fare"
              disabled={action.isPending}
              onClick={() => {
                action.mutate(() => mutate(`/api/admin/rounds/${round.id}/close`));
              }}
            >
              Avslutt heile runden
            </button>
          )}
        </section>
      ))}
      <AuditLog />
    </>
  );
}
