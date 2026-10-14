import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';

export function ArchiveReminder() {
  const q = useQuery({
    queryKey: ['archive-reminder'],
    queryFn: () =>
      api<{ delete_by: string; overdue: boolean } | null>('/api/admin/cutover/reminder'),
  });
  return q.data ? (
    <section className="del" role="status">
      <h2>Arkivet frå kartlegging</h2>
      <p>
        {q.data.overdue ? 'Fristen har gått ut.' : 'Fristen nærmar seg.'} Slett arkivet seinast{' '}
        {q.data.delete_by}. Stadfest slettinga med Vardahei IT.
      </p>
    </section>
  ) : null;
}
