// «Live» of a seminar (3.4, 3.5; Vardestien `semKropp`): the question card with «Ope → Stengt →
// Vist», «N har svart» and the buttons «Opne», «Steng spørsmålet» and «Vis resultatet»; the big
// screen as the hall will see it; the link for the phones; the presenter key. The panel shows the
// same as the big screen: a count while a question is open, the result only after «Vis», and with
// fewer than three answers no numbers at all.
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, mutate } from './api.js';
import { Icon } from './icons.js';
import { ErrorMessage } from './queries.js';
import { PresenterKey } from './seminar-live-key.js';
import {
  answeredText,
  CHAIN,
  leading,
  percent,
  STATE_LABEL,
  type LiveAction,
  type LivePanel,
  type LiveQuestion,
  type LiveSnapshot,
} from './seminar-live-models.js';
import { copy, go, type SeminarDetail } from './seminar-models.js';
import { useToast } from './shell.js';

function useStep(seminar: string) {
  const queries = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const run = async (question: string, action: LiveAction) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const poll = await mutate<LiveSnapshot>(
        `/api/admin/seminars/${seminar}/live/questions/${encodeURIComponent(question)}/${action}`,
      );
      queries.setQueryData<LivePanel>(['live', seminar], (old) => (old ? { ...old, poll } : old));
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Noko gjekk gale.'));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function Result({ poll }: { poll: LiveSnapshot }) {
  const c = poll.current;
  if (!c || c.state !== 'released' || !c.result) return null;
  if (c.result.suppressed)
    return (
      <p className="live-for-fa">
        <b>For få svar til å vise tal</b>
        <span>Når færre enn tre har svart, viser vi ingen tal.</span>
      </p>
    );
  return (
    <div className="poll">
      {c.result.options.map((o) => {
        const label = c.options.find((x) => x.id === o.id)?.text.nn ?? o.id;
        return (
          <div className="poll-rad" key={o.id}>
            <span>{label}</span>
            <span className="bar" aria-hidden="true">
              <span style={{ transform: `scaleX(${o.share})` }} />
            </span>
            <b aria-label={`${label}: ${percent(o.share)}, ${o.count} svar`}>{percent(o.share)}</b>
          </div>
        );
      })}
    </div>
  );
}

function QuestionCard({ seminar, poll }: { seminar: SeminarDetail; poll: LiveSnapshot }) {
  const { busy, error, run } = useStep(seminar.id);
  const q = leading(poll);
  const c = poll.current?.id === q?.id ? poll.current : null;
  const someOpen = poll.questions.some((x) => x.state === 'open');
  const next = poll.questions.find((x) => x.state === 'waiting');
  const action = (x: LiveQuestion): [LiveAction, string] | null =>
    x.state === 'open'
      ? ['close', 'Steng']
      : x.state === 'closed'
        ? ['release', 'Vis']
        : x.state === 'waiting' && !someOpen
          ? ['open', 'Opne']
          : null;
  return (
    <section className="kort s5 live-kort" aria-labelledby="live-tittel">
      <div className="kort-hovud">
        <h2 id="live-tittel">Live-spørsmål</h2>
        {q && q.state !== 'waiting' && (
          <span className="tilstand-stig" aria-label={`Tilstand: ${STATE_LABEL[q.state]}`}>
            {CHAIN.map((s) => (
              <span key={s} className={q.state === s ? 'no' : ''}>
                {STATE_LABEL[s]}
              </span>
            ))}
          </span>
        )}
      </div>
      <div className="kort-innhald live-innhald">
        {q && (
          <>
            <span className="eyebrow">
              Spørsmål {q.no} av {poll.total}
            </span>
            <b className="live-sporsmal">{q.text.nn}</b>
            {c && (c.state === 'open' || c.state === 'closed') && (
              <p className="muted live-svart" role="status" data-testid="har-svart">
                {answeredText(c.answered ?? 0)}
                {seminar.registrations.total > 0 && ` · ${seminar.registrations.total} påmelde`}
              </p>
            )}
            <Result poll={poll} />
            <div className="handlingar">
              {q.state === 'waiting' && (
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || someOpen}
                  onClick={() => void run(q.id, 'open')}
                >
                  <Icon name="start" small />
                  Opne spørsmålet
                </button>
              )}
              {q.state === 'open' && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void run(q.id, 'close')}
                >
                  <Icon name="stopp" small />
                  Steng spørsmålet
                </button>
              )}
              {q.state === 'closed' && (
                <>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => void run(q.id, 'release')}
                  >
                    <Icon name="skjerm" small />
                    Vis resultatet
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busy}
                    onClick={() => void run(q.id, 'open')}
                  >
                    <Icon name="oppdater" small />
                    Opne igjen
                  </button>
                </>
              )}
              {q.state === 'released' && next && (
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => void run(next.id, 'open')}
                >
                  <Icon name="start" small />
                  Opne neste spørsmål
                </button>
              )}
            </div>
            <ErrorMessage error={error} />
          </>
        )}
        <ol className="live-liste" aria-label="Alle spørsmåla">
          {poll.questions.map((x) => {
            const a = action(x);
            return (
              <li key={x.id} className={x.id === q?.id ? 'no' : ''}>
                <span className="nr">{x.no}</span>
                <span className="tekst">{x.text.nn}</span>
                <span className={`chip live-${x.state}`}>{STATE_LABEL[x.state]}</span>
                {a && (
                  <button
                    type="button"
                    className="btn sm ghost"
                    disabled={busy}
                    aria-label={`${a[1]} spørsmål ${x.no}`}
                    onClick={() => void run(x.id, a[0])}
                  >
                    {a[1]}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        <p className="forklaring">
          Resultatet blir vist først når spørsmålet er stengt og du vel «Vis». Eit vist spørsmål kan
          ikkje opnast igjen.
        </p>
      </div>
    </section>
  );
}

/** The frame draws the big screen at 1280 × 720 and scales it down to the card, as a projector would. */
const SCREEN = { width: 1280, height: 720 };

/** The big screen as the hall sees it: the real page in a frame, fed by this panel (postMessage). */
function ScreenPreview({ poll }: { poll: LiveSnapshot }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [scale, setScale] = useState(0.45);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(entry.contentRect.width / SCREEN.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow) return;
      if ((e.data as { type?: unknown } | null)?.type === 'varde:storskjerm-klar') setReady(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  useEffect(() => {
    if (ready)
      frame.current?.contentWindow?.postMessage(
        { type: 'varde:storskjerm', snapshot: poll, lang: 'nn' },
        location.origin,
      );
  }, [ready, poll]);
  return (
    <section className="s7 live-storskjerm" aria-label="Storskjerm">
      <div className="live-ramme" ref={box}>
        <iframe
          ref={frame}
          title="Førehandsvising av storskjermen"
          src="/p?preview=1"
          tabIndex={-1}
          width={SCREEN.width}
          height={SCREEN.height}
          style={{ transform: `scale(${scale})` }}
        />
      </div>
      <p className="forklaring">
        Storskjermen opnar med ein eigen nøkkel for seminardagen, ikkje med innlogging. Han viser
        berre resultat som er viste.
      </p>
    </section>
  );
}

function Phones({ poll }: { poll: LiveSnapshot }) {
  const toast = useToast();
  return (
    <section className="kort s5">
      <div className="kort-hovud">
        <h2>
          <Icon name="folk" small />
          Lenkje til mobilane
        </h2>
      </div>
      <div className="kort-innhald">
        {poll.link ? (
          <>
            <div className="sem-lenkje">
              <code data-testid="live-lenkje">{poll.link}</code>
              <button
                type="button"
                className="btn sm"
                onClick={() => copy(poll.link!, toast, 'Lenkja er kopiert')}
              >
                <Icon name="kopi" small />
                Kopier
              </button>
            </div>
            <p className="forklaring">
              Same lenkje for alle i salen, utan namn. Ho står òg som QR-kode på storskjermen, og ho
              sluttar å verke dagen etter seminaret.
            </p>
          </>
        ) : (
          <p className="forklaring">
            Adressa til Varde (PUBLIC_URL) er ikkje sett opp, så det finst inga lenkje.
          </p>
        )}
      </div>
    </section>
  );
}

function CreatePoll({ seminar, panel }: { seminar: SeminarDetail; panel: LivePanel }) {
  const queries = useQueryClient();
  const usable = panel.versions.filter((v) => v.problem === null);
  const [version, setVersion] = useState(usable[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await mutate(`/api/admin/seminars/${seminar.id}/live`, 'POST', {
        template_version_id: version,
      });
      await queries.invalidateQueries({ queryKey: ['live', seminar.id] });
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Noko gjekk gale.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flate">
      <section className="kort s7">
        <div className="kort-hovud">
          <h2>Live-spørsmål</h2>
        </div>
        <div className="kort-innhald live-lag">
          <p>Spørsmål på mobilen under seminaret, med resultat på storskjermen.</p>
          {usable.length > 0 ? (
            <>
              <label className="field">
                <span>Skjema</span>
                <select
                  className="input"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                >
                  {usable.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.key} · {v.label} · {v.questions} spørsmål
                    </option>
                  ))}
                </select>
              </label>
              <div className="handlingar">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || !version}
                  onClick={() => void create()}
                >
                  Lag live-spørsmål
                </button>
              </div>
            </>
          ) : (
            <p className="forklaring">
              Det finst ikkje noko publisert skjema for live-spørsmål enno. Lag eit under{' '}
              <a href="/admin/surveys" onClick={(e) => go(e, '/admin/surveys')}>
                Skjema
              </a>{' '}
              med målgruppa «Under seminar».
            </p>
          )}
          {panel.versions.some((v) => v.problem) && (
            <ul className="live-utan">
              {panel.versions
                .filter((v) => v.problem)
                .map((v) => (
                  <li key={v.id}>
                    <b>
                      {v.key} · {v.label}
                    </b>
                    <span>{v.problem}</span>
                  </li>
                ))}
            </ul>
          )}
          <ErrorMessage error={error} />
        </div>
      </section>
    </div>
  );
}

function RemovePoll({ seminar }: { seminar: string }) {
  const queries = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const remove = async () => {
    try {
      await mutate(`/api/admin/seminars/${seminar}/live`, 'DELETE');
      await queries.invalidateQueries({ queryKey: ['live', seminar] });
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Noko gjekk gale.'));
    }
    setConfirm(false);
  };
  return (
    <div className="s12 live-ta-bort">
      <button
        type="button"
        className={confirm ? 'btn sm danger' : 'btn sm ghost'}
        onClick={() => (confirm ? void remove() : setConfirm(true))}
      >
        {confirm ? 'Stadfest: ta bort' : 'Ta bort live-spørsmåla'}
      </button>
      <span className="forklaring">
        Går berre før det første spørsmålet er opna. Lenkja og nøkkelen sluttar å verke.
      </span>
      <ErrorMessage error={error} />
    </div>
  );
}

export function Live({ seminar }: { seminar: SeminarDetail }) {
  const panel = useQuery({
    queryKey: ['live', seminar.id],
    queryFn: () => api<LivePanel>(`/api/admin/seminars/${seminar.id}/live`),
  });
  const data = panel.data;
  if (!data) return <ErrorMessage error={panel.error} />;
  if (!data.poll) return <CreatePoll seminar={seminar} panel={data} />;
  return (
    <div className="flate">
      <QuestionCard seminar={seminar} poll={data.poll} />
      <ScreenPreview poll={data.poll} />
      <Phones poll={data.poll} />
      <PresenterKey seminar={seminar.id} presenter={data.presenter} />
      {data.poll.questions.every((q) => q.state === 'waiting') && (
        <RemovePoll seminar={seminar.id} />
      )}
    </div>
  );
}
