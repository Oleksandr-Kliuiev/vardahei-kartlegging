import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';
import type { Client, Round, Version } from './models.js';

export const useRounds = () =>
  useQuery({ queryKey: ['rounds', 'list'], queryFn: () => api<Round[]>('/api/admin/rounds') });
export const useClients = () =>
  useQuery({ queryKey: ['rounds', 'clients'], queryFn: () => api<Client[]>('/api/admin/clients') });
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
