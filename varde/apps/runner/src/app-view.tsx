import { useEffect, useState } from 'preact/hooks';
import { Preview } from './preview.js';
import { expireCodeDrafts } from './draft.js';
import type { Landscape } from './landscape/landscape.js';
import { direct } from './scene.js';
import { StateScreen, type StateKind } from './screens.js';
import { Shell } from './shell.js';
import { Survey } from './survey.js';
import { LivePoll } from './live/live.js';
import { isLive, loadRound, RunnerError, type LiveRound, type RunnerRound } from './round.js';

export function App() {
  const preview = new URLSearchParams(location.search).get('preview');
  return preview ? <Preview id={preview} /> : <LiveApp />;
}

/** Closed (410), replaced, unknown links and a failed connection each get their own screen and mood. */
function stateOf(err: RunnerError): StateKind {
  if (err.status === 410) return 'closed';
  if (err.status === 0) return 'offline';
  if (err.status === 403 && err.message.startsWith('Lenkja er bytt ut')) return 'revoked';
  return 'invalid';
}
const EMPTY = { sections: [], marks: [], at: 0, lastCommon: 0, no: 0, total: 0, leaderCount: 0 };

function LiveApp() {
  const [round, setRound] = useState<RunnerRound | LiveRound | null>(null);
  const [error, setError] = useState<RunnerError | null>(null);
  const [land, setLand] = useState<Landscape | null>(null);
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
  const kind: StateKind | null = error ? stateOf(error) : round ? null : 'loading';
  useEffect(() => {
    if (land && kind) direct(land, kind, EMPTY, { of: '', top: '' }, kind === 'loading');
  }, [land, kind]);
  if (round && !error)
    return isLive(round) ? (
      <LivePoll code={new URLSearchParams(location.search).get('c') ?? ''} />
    ) : (
      <Survey round={round} />
    );
  return (
    <Shell lang="nn" onLand={setLand}>
      <main id="main" class="app">
        <StateScreen kind={kind ?? 'loading'} lang="nn" />
      </main>
    </Shell>
  );
}
