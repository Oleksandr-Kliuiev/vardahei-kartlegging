import { useEffect, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api.js';

/** Exactly one stream in the authenticated shell, independent of the selected section. */
export function useEvents(client: QueryClient): boolean {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const stream = new EventSource('/api/admin/events');
    let disposed = false;
    stream.onopen = () => {
      setConnected(true);
    };
    stream.onerror = () => {
      setConnected(false);
      void api('/auth/me').catch((error: unknown) => {
        // A server restart must retain EventSource's automatic reconnect. Only a
        // rejected session is terminal; a transient fetch/5xx error is not.
        if (!disposed && error instanceof ApiError && [401, 403].includes(error.status))
          stream.close();
      });
    };
    const changed = (event: MessageEvent<string>) => {
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (typeof payload !== 'object' || payload === null) return;
      const topic = (payload as { topic?: unknown }).topic;
      if (topic === 'progress' || topic === 'responses' || topic === 'rounds' || topic === 'seminars')
        void client.invalidateQueries({ queryKey: [topic] });
    };
    stream.addEventListener('changed', changed);
    return () => {
      disposed = true;
      stream.removeEventListener('changed', changed);
      stream.close();
    };
  }, [client]);
  return connected;
}
