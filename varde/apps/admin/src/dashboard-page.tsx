import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import type { Dashboard } from './dashboard-models.js';
import { ErrorMessage, useRounds } from './queries.js';
import { Zones, KeyQuestions, Findings, CommonQuestions } from './dashboard-aggregate.js';
import { EmployeeSection, QuotesSection } from './dashboard-rows.js';
import { LeaderSection } from './dashboard-leader.js';
import { ComparisonSection } from './dashboard-comparison.js';
import './dashboard.css';
import { Fold, FoldAll, FoldProvider } from './fold.js';

function DashboardRound({
  round,
  clients,
}: {
  round: string;
  clients: { client_id: string; client: { name: string } }[];
}) {
  const [client, setClient] = useState(''),
    [role, setRole] = useState('');
  const rowsQuery = new URLSearchParams({ round, ...(client ? { client } : {}) }).toString();
  const query = new URLSearchParams({
    round,
    ...(client ? { client } : {}),
    ...(role ? { role } : {}),
  }).toString();
  const result = useQuery({
    queryKey: ['responses', 'dashboard', query],
    queryFn: () => api<Dashboard>(`/api/admin/dashboard?${query}`),
  });
  // Role availability is read without a role filter, so the menu remains stable.
  const options = useQuery({
    queryKey: ['responses', 'dashboard', rowsQuery],
    queryFn: () => api<Dashboard>(`/api/admin/dashboard?${rowsQuery}`),
  });
  const data = result.data;
  return (
    <>
      <div className="dashboard-filter">
        <span className="filterpar">
          <label htmlFor="dashboard-client">Kunde</label>
          <select
            id="dashboard-client"
            value={client}
            onChange={(e) => {
              setClient(e.target.value);
              setRole('');
            }}
          >
            <option value="">Alle</option>
            {clients.map((c) => (
              <option key={c.client_id} value={c.client_id}>
                {c.client.name}
              </option>
            ))}
          </select>
        </span>
        <span className="filterpar">
          <label htmlFor="dashboard-role">Rolle</label>
          <select id="dashboard-role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Alle</option>
            {options.data?.roles.map((r) => (
              <option value={r.id} key={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </span>
      </div>
      <ErrorMessage error={result.error} />
      {data && (
        <>
          <p className="under">
            {data.source === 'released'
              ? 'Publiserte tal frå den avslutta runden.'
              : 'Levande tal frå den opne runden.'}{' '}
            {data.suppression_note}
          </p>
          {data.zones && <Zones data={data.zones} />}
          <Fold title={data.template === 'ki' ? 'Kvar KI kan hjelpe' : 'Dette bør vi ta tak i'}>
            <p className="under">{thresholdText(data.finding_thresholds)}</p>
            <Findings findings={data.findings} />
          </Fold>
          {data.template === 'ki' && data.mode === 'initials' && (
            <EmployeeSection query={rowsQuery} />
          )}
          {data.template === 'tryggleik' && (
            <>
              <KeyQuestions questions={data.key_questions} />
              <ComparisonSection query={query} showClients={!client} />
              {data.mode === 'initials' && <EmployeeSection query={rowsQuery} />}
            </>
          )}
          <CommonQuestions data={data} />
          <QuotesSection query={rowsQuery} showClient={!client} />
          <LeaderSection round={round} client={client} />
        </>
      )}
    </>
  );
}

const percentText = (share: number) =>
  `${new Intl.NumberFormat('nn-NO', { maximumFractionDigits: 1 }).format(share * 100)} %`;

/** The thresholds of the rules in force, or a pointer to «Funn» when the rules differ (16.10). */
export function thresholdText(t: Dashboard['finding_thresholds']): string {
  if (!t || t.min_count === null || t.medium === null || t.high === null)
    return 'Funn rekna ut frå svara etter tersklane i kvar regel (sjå «Funn»).';
  return `Funn rekna ut frå svara: minst ${t.min_count} personar, middels frå ${percentText(t.medium)}, høg frå ${percentText(t.high)}.`;
}
export function DashboardPage() {
  // A link from a seminar's «Rundar» (3.8) opens one round: /admin/dashboard?round=<id>.
  const rounds = useRounds(),
    [selected, setSelected] = useState(
      () => new URLSearchParams(window.location.search).get('round') ?? '',
    );
  // Opens on the newest round that has answers; then an open round; then the newest.
  const round =
    rounds.data?.find((r) => r.id === selected) ??
    rounds.data?.find((r) => r.has_data) ??
    rounds.data?.find((r) => r.status === 'open') ??
    rounds.data?.[0];
  return (
    <FoldProvider>
      <ErrorMessage error={rounds.error} />
      <div className="dashboard-filter">
        <span className="filterpar">
          <label htmlFor="dashboard-round">Runde</label>
          <select
            id="dashboard-round"
            value={round?.id ?? ''}
            onChange={(e) => setSelected(e.target.value)}
          >
            {rounds.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </span>
        <FoldAll />
      </div>
      {round ? (
        <DashboardRound key={round.id} round={round.id} clients={round.round_clients} />
      ) : (
        <p>Ingen rundar enno.</p>
      )}
    </FoldProvider>
  );
}
