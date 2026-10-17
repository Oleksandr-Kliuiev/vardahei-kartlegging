import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, mutate } from './api.js';
import { versionText, type Round, type Client, type Progress } from './models.js';
import {
  ErrorMessage,
  useAction,
  useAudit,
  useClients,
  useRounds,
  useVersions,
} from './queries.js';
import { auditTarget, auditWhat, auditWhen, auditWho } from './audit-labels.js';
import { LaunchForm } from './launch-form.js';
import { ClientForm } from './clients-form.js';
import { RoundClientCard } from './round-client.js';
import { HoldButton } from './widgets.js';

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
  const audit = useAudit(),
    rounds = useRounds();
  return (
    <section className="del">
      <h2>Siste hendingar</h2>
      <ErrorMessage error={audit.error} />
      <ol className="logg">
        {audit.data?.map((row, i) => (
          <li key={`${row.at}-${i}`}>
            <time dateTime={row.at}>{auditWhen(row.at)}</time> <strong>{auditWho(row.who)}</strong>{' '}
            {auditWhat(row.what)}{' '}
            <small>{auditTarget(row.target, { rounds: rounds.data ?? [] })}</small>
          </li>
        ))}
      </ol>
      {audit.data?.length === 0 && <p>Ingenting har skjedd enno.</p>}
    </section>
  );
}

const roundStatus: Record<string, [string, string]> = {
  draft: ['Ikkje opna', 'chip'],
  open: ['Open', 'chip ok'],
  closed: ['Avslutta', 'chip warn'],
};

/** One round: status, a card per client with its response ring, and closing by holding the button. */
function RoundSection({ round, clients }: { round: Round; clients: Client[] }) {
  const action = useAction();
  const progress = useQuery({
    queryKey: ['progress', round.id],
    queryFn: () =>
      api<{ class: 'aggregate'; clients: Progress[] }>(`/api/admin/rounds/${round.id}/progress`),
    enabled: round.status !== 'draft',
  });
  const [text, chip] = roundStatus[round.status] ?? ['Avslutta', 'chip'];
  const finished = !['draft', 'open'].includes(round.status);
  const top = (
    <div className="runde-topp">
      <h2>{round.name}</h2>
      <span className="handlingar">
        {finished && (
          <small className="runde-tal">
            {round.round_clients.length} {round.round_clients.length === 1 ? 'kunde' : 'kundar'}
          </small>
        )}
        {round.type === 'post_seminar' && <span className="chip accent">Etter seminar</span>}
        <span className={chip}>{text}</span>
      </span>
    </div>
  );
  const body = (
    <>
      <div className="kundekort-grid">
        {round.round_clients.map((rc) => (
          <RoundClientCard
            key={rc.id}
            rc={rc}
            progress={progress.data?.clients.find((p) => p.round_client_id === rc.id)}
            reportReady={['closed', 'archived'].includes(round.status) && rc.released === true}
          />
        ))}
      </div>
      {!finished && <AddClient round={round} clients={clients} />}
      {round.status === 'open' && (
        <HoldButton
          className="fare"
          label="Avslutt heile runden"
          hint="Hald inne knappen i over eitt sekund for å avslutte runden. Lenkjene sluttar då å verke."
          disabled={action.isPending}
          onConfirm={() => {
            action.mutate(() => mutate(`/api/admin/rounds/${round.id}/close`));
          }}
        />
      )}
      <ErrorMessage error={action.error ?? progress.error} />
    </>
  );
  // Finished rounds are folded to one line (click to open), so the active work stays on top.
  return (
    <section className={finished ? 'del runde samla' : 'del runde'} aria-label={round.name}>
      {finished ? (
        <details>
          <summary>{top}</summary>
          <div className="runde-innhald">{body}</div>
        </details>
      ) : (
        <>
          {top}
          {body}
        </>
      )}
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
      <div className="runder-oppsett">
        <div className="kol">
          <section className="del">
            <h2>Kundar</h2>
            <p className="under">
              Talet på tilsette blir brukt i nye rundar. Rundar som alt er oppretta, held på sitt
              eige tal.
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
        </div>
        <div className="kol">
          <LaunchForm clients={clients.data ?? []} versions={versions.data ?? []} />
          <section className="del">
            <h2>Ny tom runde</h2>
            <p className="under">
              Ei runde utan kundar. Bruk ho når du vil leggje til kundane ein for ein, med eiga
              frist for kvar. Vil du starte med kundane valde med ein gong, bruk «Start ein runde».
            </p>
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
                      {versionText(v)}
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={action.isPending}>Opprett runde</button>
            </form>
          </section>
        </div>
      </div>
      <div className="runder-liste">
        {[...(rounds.data ?? [])]
          .sort(
            (x, y) =>
              Number(!['draft', 'open'].includes(x.status)) -
              Number(!['draft', 'open'].includes(y.status)),
          )
          .map((round) => (
            <RoundSection key={round.id} round={round} clients={clients.data ?? []} />
          ))}
      </div>
      <AuditLog />
    </>
  );
}
