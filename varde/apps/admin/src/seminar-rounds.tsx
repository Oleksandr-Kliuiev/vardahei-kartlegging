// «Rundar» of a seminar (3.8; Vardestien `semKropp` «Oppfølging»): the survey before, the live
// poll and the survey after, each with its state, the answers of the seminar's clients (the
// progress of the round, exact as on «Rundar») and its links. «Før» and «Etter» are chosen here;
// a new «Etter» is started with the round wizard, which links it at once.
import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, mutate } from './api.js';
import { Icon, type IconName } from './icons.js';
import { LaunchForm } from './launch-form.js';
import type { Progress } from './models.js';
import { ErrorMessage, useClients } from './queries.js';
import type { LivePanel } from './seminar-live-models.js';
import { go, type SeminarDetail } from './seminar-models.js';
import {
  answered,
  liveState,
  ROUND_STATE,
  type RoundChoice,
  type RoundStep,
  type SeminarRounds,
  type Slot,
} from './seminar-rounds-models.js';

export const roundsKey = (seminar: string) => ['seminars', 'rounds', seminar] as const;

function Links({ round }: { round: string }) {
  const insight = `/admin/dashboard?round=${round}`;
  return (
    <span className="sem-steg-lenkjer">
      <a className="linkbtn" href={insight} onClick={(e) => go(e, insight)}>
        Sjå i Innsikt
      </a>
      <a className="linkbtn" href="/admin/rounds" onClick={(e) => go(e, '/admin/rounds')}>
        Sjå under Rundar
      </a>
    </span>
  );
}

function Step(props: {
  testid: string;
  icon: IconName;
  eyebrow: string;
  title: string;
  lines: (string | null | undefined)[];
  state: [string, string];
  children?: ReactNode;
}) {
  return (
    <li className="sem-steg-rad" data-testid={props.testid}>
      <span className="ikon">
        <Icon name={props.icon} />
      </span>
      <span className="sem-steg-tekst">
        <span className="eyebrow">{props.eyebrow}</span>
        <b>{props.title}</b>
        {props.lines
          .filter((l): l is string => !!l)
          .map((l) => (
            <small className="muted" key={l}>
              {l}
            </small>
          ))}
        {props.children}
      </span>
      <span className={props.state[1]}>{props.state[0]}</span>
    </li>
  );
}

/** Links a round as «Før» or «Etter», or takes the link away; the server says why one cannot be. */
function Choose({
  seminar,
  slot,
  choices,
  linked,
}: {
  seminar: string;
  slot: Slot;
  choices: RoundChoice[];
  linked: boolean;
}) {
  const queries = useQueryClient();
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const link = async (round: string | null) => {
    setBusy(true);
    setError(null);
    try {
      await mutate(`/api/admin/seminars/${seminar}/rounds/${slot}`, 'PUT', { round });
      setChoice('');
      await queries.invalidateQueries({ queryKey: roundsKey(seminar) });
      await queries.invalidateQueries({ queryKey: ['responses', 'before-after', seminar] });
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Noko gjekk gale.'));
    } finally {
      setBusy(false);
    }
  };
  const what = slot === 'before' ? 'før' : 'etter';
  if (linked)
    return (
      <span className="sem-kople">
        <button
          type="button"
          className="btn sm ghost"
          disabled={busy}
          onClick={() => void link(null)}
        >
          Ta bort koplinga
        </button>
        <ErrorMessage error={error} />
      </span>
    );
  return (
    <span className="sem-kople">
      {choices.length > 0 ? (
        <>
          <label className="field">
            <span>{slot === 'before' ? 'Vel undersøking før' : 'Eller vel ei som finst'}</span>
            <select className="input" value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Vel undersøking</option>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {(ROUND_STATE[c.status] ?? ['Avslutta'])[0].toLowerCase()} ·{' '}
                  {c.shared === 1 ? '1 kunde' : `${c.shared} kundar`} på seminaret
                </option>
              ))}
            </select>
          </label>
          <span className="handlingar">
            <button
              type="button"
              className="btn sm"
              disabled={!choice || busy}
              onClick={() => void link(choice)}
            >
              Kople til som «{slot === 'before' ? 'Før' : 'Etter'}»
            </button>
          </span>
        </>
      ) : (
        slot === 'before' && (
          <span className="forklaring">
            Ingen opna undersøkingar hos kundane på seminaret enno. Undersøkinga {what} må ha minst
            éin av kundane.
          </span>
        )
      )}
      <ErrorMessage error={error} />
    </span>
  );
}

function RoundLine({ step, slot }: { step: RoundStep; slot: Slot }) {
  const progress = useQuery({
    queryKey: ['progress', step.id],
    queryFn: () =>
      api<{ class: 'aggregate'; clients: Progress[] }>(`/api/admin/rounds/${step.id}/progress`),
    enabled: step.status !== 'draft',
  });
  const counts = answered(step, progress.data?.clients);
  return (
    <>
      {counts && (
        <small className="muted" data-testid={`svar-${slot}`}>
          {counts.total}
          {step.round_clients.length > 1 && ` · ${counts.per}`}
        </small>
      )}
      {step.others > 0 && (
        <small className="muted">
          Runden har òg {step.others === 1 ? 'éin kunde' : `${step.others} kundar`} som ikkje er på
          seminaret.
        </small>
      )}
      <Links round={step.id} />
    </>
  );
}

function LiveStep({ seminar, onLive }: { seminar: string; onLive: () => void }) {
  const panel = useQuery({
    queryKey: ['live', seminar],
    queryFn: () => api<LivePanel>(`/api/admin/seminars/${seminar}/live`),
  });
  const questions = panel.data ? (panel.data.poll?.questions ?? null) : undefined;
  const shown = questions?.filter((q) => q.state === 'released').length ?? 0;
  return (
    <Step
      testid="steg-live"
      icon="skjerm"
      eyebrow="Under seminaret"
      title="Live-spørsmål"
      lines={[
        questions === undefined
          ? null
          : questions === null
            ? 'Ikkje laga enno'
            : `${shown} av ${questions.length} spørsmål viste`,
      ]}
      state={questions === undefined ? ['…', 'chip'] : liveState(questions)}
    >
      <span className="sem-steg-lenkjer">
        <button type="button" className="linkbtn" onClick={onLive}>
          Opne Live
        </button>
      </span>
    </Step>
  );
}

/** «Undersøking etter seminaret» with the round wizard for the seminar's clients. */
function AfterLaunch({
  seminar,
  versions,
  onClose,
}: {
  seminar: SeminarDetail;
  versions: SeminarRounds['versions'];
  onClose: () => void;
}) {
  const queries = useQueryClient();
  const clients = useClients();
  const own = (clients.data ?? []).filter((c) => seminar.clients.some((s) => s.id === c.id));
  return (
    <div className="s12 sem-etter-start">
      <ErrorMessage error={clients.error} />
      {clients.data && (
        <LaunchForm
          clients={own}
          versions={versions}
          seminar={{ id: seminar.id, topic: seminar.topic_nn }}
          onLaunched={() => {
            void queries.invalidateQueries({ queryKey: roundsKey(seminar.id) });
            void queries.invalidateQueries({ queryKey: ['responses', 'before-after', seminar.id] });
          }}
        />
      )}
      <button type="button" className="btn sm ghost" onClick={onClose}>
        Lukk
      </button>
    </div>
  );
}

export function RoundsCard({ seminar, onLive }: { seminar: SeminarDetail; onLive: () => void }) {
  const card = useQuery({
    queryKey: roundsKey(seminar.id),
    queryFn: () => api<SeminarRounds>(`/api/admin/seminars/${seminar.id}/rounds`),
  });
  const [launching, setLaunching] = useState(false);
  const data = card.data;
  const state = (step: RoundStep | null): [string, string] =>
    step ? (ROUND_STATE[step.status] ?? ['Avslutta', 'chip']) : ['Ikkje valt', 'chip'];
  return (
    <>
      <section className="kort s5 sem-rundar" aria-labelledby="rundar-tittel">
        <div className="kort-hovud">
          <h2 id="rundar-tittel">Rundar</h2>
        </div>
        <div className="kort-innhald">
          <ErrorMessage error={card.error} />
          {data && (
            <ol className="sem-steg">
              <Step
                testid="steg-for"
                icon="flagg"
                eyebrow="Før seminaret"
                title={data.before?.name ?? 'Inga undersøking valt'}
                lines={[data.before?.template]}
                state={state(data.before)}
              >
                {data.before && <RoundLine step={data.before} slot="before" />}
                <Choose
                  seminar={seminar.id}
                  slot="before"
                  choices={data.choices.before}
                  linked={data.before !== null}
                />
              </Step>
              <LiveStep seminar={seminar.id} onLive={onLive} />
              <Step
                testid="steg-etter"
                icon="send"
                eyebrow="Etter seminaret"
                title={data.after?.name ?? 'Inga undersøking enno'}
                lines={[data.after?.template]}
                state={state(data.after)}
              >
                {data.after && <RoundLine step={data.after} slot="after" />}
                {!data.after && !launching && (
                  <span className="handlingar">
                    <button
                      type="button"
                      className="btn sm primary"
                      disabled={seminar.clients.length === 0}
                      onClick={() => setLaunching(true)}
                    >
                      <Icon name="send" small />
                      Start undersøking etter seminaret
                    </button>
                  </span>
                )}
                <Choose
                  seminar={seminar.id}
                  slot="after"
                  choices={data.choices.after}
                  linked={data.after !== null}
                />
              </Step>
            </ol>
          )}
          {seminar.clients.length === 0 && (
            <p className="forklaring">Vel kundane på seminaret under «Endre» først.</p>
          )}
        </div>
      </section>
      {launching && data && (
        <AfterLaunch
          seminar={seminar}
          versions={data.versions}
          onClose={() => setLaunching(false)}
        />
      )}
    </>
  );
}
