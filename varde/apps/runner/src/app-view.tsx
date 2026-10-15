import { useEffect, useState } from 'preact/hooks';
import { Preview } from './preview.js';
import { ui } from './i18n/ui.js';
import { expireCodeDrafts } from './draft.js';
import { Survey } from './survey.js';
import { loadRound, RunnerError, type RunnerRound } from './round.js';

export function App() {
  const preview = new URLSearchParams(location.search).get('preview');
  return preview ? <Preview id={preview} /> : <LiveApp />;
}

function LiveApp() {
  const [round, setRound] = useState<RunnerRound | null>(null);
  const [error, setError] = useState<RunnerError | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const code = new URLSearchParams(location.search).get('c') ?? '';
    void loadRound(code, controller.signal)
      .then(setRound)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof RunnerError ? err : new RunnerError(0, 'Sjekk nettet og prøv igjen.'),
          );
          if (err instanceof RunnerError && err.status === 410)
            void expireCodeDrafts(code).catch(() => {});
        }
      });
    return () => controller.abort();
  }, []);
  if (error)
    return (
      <main class="wrap">
        <h1>{error.status === 410 ? 'Kartlegginga er avslutta.' : error.message}</h1>
      </main>
    );
  if (!round)
    return (
      <main class="wrap">
        <p role="status">{ui('nn', 'loading')}</p>
      </main>
    );
  return <Survey round={round} />;
}
