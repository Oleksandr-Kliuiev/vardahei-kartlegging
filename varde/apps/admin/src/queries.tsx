import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';
import type { Client, Round, Version } from './models.js';
import type { SurveySummary } from './survey-models.js';
import { byNorsk } from './norsk.js';

// The database orders names in its own collation, where «Årdal» lands among the A's. Both lists are
// put in Norwegian order here, so every place that shows clients — the list, the pickers, the cards
// of a round — reads the same way.
export const useRounds = () =>
  useQuery({
    queryKey: ['rounds', 'list'],
    queryFn: async () =>
      (await api<Round[]>('/api/admin/rounds')).map((r) => ({
        ...r,
        round_clients: [...r.round_clients].sort((a, b) => byNorsk(a.client.name, b.client.name)),
      })),
  });
export const useClients = () =>
  useQuery({
    queryKey: ['rounds', 'clients'],
    queryFn: async () =>
      (await api<Client[]>('/api/admin/clients')).sort((a, b) => byNorsk(a.name, b.name)),
  });
/** The surveys, for the ⌘K palette: the library itself reads the same cache (wave C). */
export const useSurveys = () =>
  useQuery({
    queryKey: ['surveys'],
    queryFn: () => api<SurveySummary[]>('/api/admin/surveys'),
  });
export const useVersions = () =>
  useQuery({
    queryKey: ['rounds', 'versions'],
    queryFn: () => api<Version[]>('/api/admin/versions'),
  });
export function useAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['rounds'] });
    },
  });
}

export function ErrorMessage({ error }: { error: Error | null }) {
  return error ? <p role="alert">{error.message}</p> : null;
}
