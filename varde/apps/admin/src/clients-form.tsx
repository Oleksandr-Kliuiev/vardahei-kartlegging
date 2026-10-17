import type { FormEvent } from 'react';
import { mutate } from './api.js';
import type { Client } from './models.js';
import { ErrorMessage, useAction } from './queries.js';

/** A new client, or the name and head count of one (2.17: on the client's own page). */
export function ClientForm({
  client,
  onSaved,
}: {
  client?: Client;
  onSaved?: (saved: Client) => void;
}) {
  const action = useAction();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const element = e.currentTarget,
      data = new FormData(element);
    action.mutate(
      () =>
        mutate<Client>(
          client ? `/api/admin/clients/${client.id}` : '/api/admin/clients',
          client ? 'PUT' : 'POST',
          {
            name: data.get('name'),
            employee_count: data.get('count') === '' ? null : Number(data.get('count')),
          },
        ),
      {
        onSuccess: (saved) => {
          if (!client) element.reset();
          onSaved?.(saved as Client);
        },
      },
    );
  }
  return (
    <form className="editor-form" onSubmit={submit}>
      <label>
        Kundenamn
        <input name="name" required maxLength={200} defaultValue={client?.name ?? ''} />
      </label>
      <label>
        Tal tilsette
        <input
          name="count"
          type="number"
          min={1}
          max={9999}
          defaultValue={client?.employee_count ?? ''}
        />
      </label>
      <button disabled={action.isPending}>{client ? 'Lagre kunde' : 'Opprett kunde'}</button>
      <ErrorMessage error={action.error} />
    </form>
  );
}
