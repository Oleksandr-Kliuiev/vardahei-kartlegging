// The presenter's page `/p#t=<key>` (3.5): the big screen of one seminar live poll with the
// controls «Opne», «Steng» and «Vis». With `?preview` it is the admin's preview in a frame: no key,
// no controls, the snapshot comes from the admin page (same origin, the parent only).
import { useEffect, useState } from 'preact/hooks';
import logo from '../logo.png';
import {
  connect,
  ScreenError,
  step,
  takeKey,
  type LiveAction,
  type LiveSnapshot,
  type StreamStatus,
} from './api.js';
import { BigScreen } from './screen.js';
import { pick, st, type ScreenLang } from './texts.js';

type Question = LiveSnapshot['questions'][number];

/** What the buttons act on when the presenter has not picked: the open question, a closed one
 * waiting to be shown, else the next one waiting. */
export function defaultChoice(s: LiveSnapshot): Question | undefined {
  return (
    s.questions.find((q) => q.state === 'open') ??
    (s.current?.state === 'closed' ? s.questions.find((q) => q.id === s.current!.id) : undefined) ??
    s.questions.find((q) => q.state === 'waiting') ??
    s.questions.find((q) => q.id === s.current?.id)
  );
}

export function Controls({
  snapshot,
  lang,
  onStep,
}: {
  snapshot: LiveSnapshot;
  lang: ScreenLang;
  onStep: (question: string, action: LiveAction) => Promise<void>;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const q = snapshot.questions.find((x) => x.id === chosen) ?? defaultChoice(snapshot);
  if (!q) return null;
  const otherOpen = snapshot.questions.some((x) => x.state === 'open' && x.id !== q.id);
  const can: Record<LiveAction, boolean> = {
    open: (q.state === 'waiting' || q.state === 'closed') && !otherOpen,
    close: q.state === 'open',
    release: q.state === 'closed',
  };
  const primary: LiveAction =
    q.state === 'open' ? 'close' : q.state === 'closed' ? 'release' : 'open';
  const act = (action: LiveAction) => {
    if (busy) return;
    setBusy(true);
    setError('');
    void onStep(q.id, action)
      .then(() => setChosen(null))
      .catch((e: unknown) =>
        setError(e instanceof ScreenError && e.message ? e.message : st(lang, 'feil')),
      )
      .finally(() => setBusy(false));
  };
  const button = (
    action: LiveAction,
    label: 'opne' | 'steng' | 'vis',
    aria: 'opneNr' | 'stengNr' | 'visNr',
  ) => (
    <button
      type="button"
      id={`styr-${action}`}
      class={`btn${primary === action ? ' primary' : ''}`}
      disabled={busy || !can[action]}
      aria-label={st(lang, aria, { i: q.no })}
      onClick={() => act(action)}
    >
      {st(lang, label)}
    </button>
  );
  return (
    <nav class="styring" aria-label={st(lang, 'styring')}>
      <div class="nummer" role="group" aria-label={st(lang, 'velSporsmal')}>
        {snapshot.questions.map((x) => (
          <button
            type="button"
            key={x.id}
            class={`nr ${x.state}`}
            aria-pressed={x.id === q.id}
            title={pick(x.text, lang)}
            onClick={() => setChosen(x.id)}
          >
            {x.no}
          </button>
        ))}
      </div>
      <p class="valt">{pick(q.text, lang)}</p>
      <div class="knappar">
        {button('open', 'opne', 'opneNr')}
        {button('close', 'steng', 'stengNr')}
        {button('release', 'vis', 'visNr')}
      </div>
      {error && (
        <p class="feil" role="alert">
          {error}
        </p>
      )}
    </nav>
  );
}

function Top({
  snapshot,
  lang,
  setLang,
  status,
}: {
  snapshot: LiveSnapshot | null;
  lang: ScreenLang;
  setLang: (l: ScreenLang) => void;
  status?: StreamStatus;
}) {
  return (
    <header class="p-topp">
      <span class="logo-plate">
        <img class="logo" src={logo} alt="Vardahei IT" width={120} height={24} />
      </span>
      {snapshot && <span class="tema">{pick(snapshot.seminar.topic, lang)}</span>}
      {status && (
        <span class={`chip samband ${status}`} role="status">
          {status === 'live' && <span class="live-dot" />}
          {st(lang, status === 'live' ? 'tilkopla' : status === 'connecting' ? 'koplar' : 'borte')}
        </span>
      )}
      {snapshot?.languages.includes('en') && (
        <div class="seg" role="group" aria-label={st(lang, 'sprak')}>
          {(['nn', 'en'] as const).map((l) => (
            <button type="button" key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>
              {l === 'nn' ? 'Nynorsk' : 'English'}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}

function Preview() {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [lang, setLang] = useState<ScreenLang>('nn');
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== window.parent) return;
      const m = e.data as { type?: unknown; snapshot?: LiveSnapshot; lang?: unknown } | null;
      if (m?.type !== 'varde:storskjerm' || !m.snapshot) return;
      setSnapshot(m.snapshot);
      if (m.lang === 'nn' || m.lang === 'en') setLang(m.lang);
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'varde:storskjerm-klar' }, location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  return (
    <div class="p-side forhand">{snapshot && <BigScreen snapshot={snapshot} lang={lang} />}</div>
  );
}

function Live({ presenterKey }: { presenterKey: string }) {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [stopped, setStopped] = useState<string | null>(null);
  const [lang, setLang] = useState<ScreenLang>('nn');
  useEffect(
    () =>
      connect(presenterKey, {
        snapshot: setSnapshot,
        status: setStatus,
        stopped: (e) => setStopped(e.message || st('nn', 'ingenNokkel')),
      }),
    [presenterKey],
  );
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const onStep = async (question: string, action: LiveAction) => {
    setSnapshot(await step(presenterKey, question, action));
  };
  if (stopped) return <Stopped text={stopped} />;
  return (
    <div class="p-side">
      <Top snapshot={snapshot} lang={lang} setLang={setLang} status={status} />
      <main id="main">{snapshot && <BigScreen snapshot={snapshot} lang={lang} />}</main>
      {snapshot && <Controls snapshot={snapshot} lang={lang} onStep={onStep} />}
    </div>
  );
}

function Stopped({ text }: { text: string }) {
  return (
    <div class="p-side">
      <Top snapshot={null} lang="nn" setLang={() => undefined} />
      <main id="main" class="p-stopp">
        <h1>{st('nn', 'tittel')}</h1>
        <p role="alert">{text}</p>
      </main>
    </div>
  );
}

export function PresenterApp() {
  const [key] = useState(() =>
    new URLSearchParams(location.search).has('preview') ? 'preview' : takeKey(),
  );
  if (key === 'preview') return <Preview />;
  if (key === null) return <Stopped text={st('nn', 'ingenNokkel')} />;
  return <Live presenterKey={key} />;
}
