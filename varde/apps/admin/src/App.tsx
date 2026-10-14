import { useEffect, useState, type MouseEvent } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import logo from './logo.png';
import { api } from './api.js';
import { useEvents } from './events.js';
import { RoundsPage } from './rounds-page.js';
import { ProgressPage } from './progress-page.js';
import { ErrorMessage } from './queries.js';

const sections = [
  ['/admin', 'Oversikt'],
  ['/admin/rounds', 'Kundar og rundar'],
  ['/admin/dashboard', 'Dashbord'],
  ['/admin/export', 'Eksport'],
  ['/admin/deletion', 'Sletting'],
] as const;

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false } },
  });
}

function Shell({ name }: { name: string | null }) {
  const client = useQueryClient();
  const connected = useEvents(client);
  const [path, setPath] = useState(window.location.pathname.replace(/\/$/, '') || '/admin');
  useEffect(() => {
    const pop = () => {
      setPath(window.location.pathname.replace(/\/$/, '') || '/admin');
    };
    window.addEventListener('popstate', pop);
    return () => {
      window.removeEventListener('popstate', pop);
    };
  }, []);
  function navigate(event: MouseEvent<HTMLAnchorElement>, to: string) {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.history.pushState(null, '', to);
    setPath(to);
  }
  async function logout() {
    await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin', redirect: 'manual' });
    client.clear();
    window.location.assign('/');
  }
  const section = sections.find(([url]) => url === path);
  return (
    <div className="ark">
      <header className="topp">
        <a href="/" aria-label="Varde, heim">
          <img className="logo" src={logo} alt="Vardahei IT" />
        </a>
        <nav className="meny" aria-label="Hovudmeny">
          {sections.map(([url, label]) => (
            <a
              key={url}
              href={url}
              aria-current={path === url ? 'page' : undefined}
              onClick={(e) => navigate(e, url)}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="meg">
          <span>{name ?? 'Du er logga inn'}</span>
          <button
            onClick={() => {
              void logout();
            }}
          >
            Logg ut
          </button>
        </div>
      </header>
      <main>
        <div className="no">
          <h1>{section?.[1] ?? 'Sida finst ikkje'}</h1>
          <span className="puls" role="status">
            {connected ? 'Oppdatert i sanntid' : 'Koplar til sanntid …'}
          </span>
        </div>
        {path === '/admin' ? (
          <ProgressPage />
        ) : path === '/admin/rounds' ? (
          <RoundsPage />
        ) : (
          <section className="del">
            <p>{section ? 'Denne delen kjem snart.' : 'Vel ein del i menyen.'}</p>
          </section>
        )}
      </main>
    </div>
  );
}

function Session() {
  const [forbidden, setForbidden] = useState(false);
  const me = useQuery({
    queryKey: ['session'],
    queryFn: () => api<{ name: string | null }>('/auth/me'),
  });
  useEffect(() => {
    const deny = () => {
      setForbidden(true);
    };
    window.addEventListener('varde:forbidden', deny);
    return () => {
      window.removeEventListener('varde:forbidden', deny);
    };
  }, []);
  if (forbidden)
    return (
      <main className="ark">
        <h1>Du har ikkje tilgang</h1>
        <p>Kontakt Vardahei IT om du treng tilgang.</p>
      </main>
    );
  if (!me.data)
    return (
      <main className="ark">
        <h1>Varde</h1>
        <ErrorMessage error={me.error} />
        <p>Hentar innlogging …</p>
      </main>
    );
  return <Shell name={me.data.name} />;
}

export function App() {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      <Session />
    </QueryClientProvider>
  );
}
