// A phone in a seminar live poll (3.6, Vardestien): only the question that is open now. A single
// choice is sent as soon as it is tapped (after the same short pause as in the survey), several
// choices with «Send svaret». The phone asks for the state every 2.5 s and moves on by itself: wait
// before the first question, thanks after an answer, «Spørsmålet er stengt» when a question closed
// before the answer got in, and thanks at the end. The landscape stands still at the trailhead.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { AnswerValue } from '@varde/rules/runner';
import type { Lang } from '@varde/schema/template/texts';
import { expireCodeDrafts } from '../draft.js';
import { ui, type UiKey } from '../i18n/ui.js';
import type { Landscape } from '../landscape/landscape.js';
import { useEnter } from '../motion-hooks.js';
import { canContinue, QuestionRenderer } from '../renderers.js';
import { RunnerError } from '../round.js';
import { direct } from '../scene.js';
import { StateScreen, type StateKind } from '../screens.js';
import { ActionBar, Shell, type BarButton } from '../shell.js';
import { Icon } from '../icons.js';
import {
  liveDraftKey,
  liveRequest,
  loadLive,
  loadLiveDraft,
  saveLiveDraft,
  sendAnswer,
  type LiveDraft,
  type LiveView,
} from './live-api.js';

const POLL_MS = 2500;
const HIDDEN_POLL_MS = 6000;
const EMPTY = { sections: [], marks: [], at: 0, lastCommon: 0, no: 0, total: 0, leaderCount: 0 };

function stateOf(err: RunnerError): StateKind {
  if (err.status === 410) return 'closed';
  if (err.status === 403 && err.message.startsWith('Lenkja er bytt ut')) return 'revoked';
  return 'invalid';
}

/** What the phone shows now. */
export type LiveScreen = 'loading' | 'waiting' | 'question' | 'thanks' | 'closed' | 'next' | 'done';

export function liveScreen(
  view: LiveView | null,
  draft: LiveDraft,
  missed: string | null,
  answered: string | null,
): LiveScreen {
  if (!view) return 'loading';
  if (view.state === 'open') {
    const item = draft.items[view.question.id];
    if (item?.confirmed) return 'thanks';
    if (item?.closed) return 'closed';
    return 'question';
  }
  if (view.state === 'done') return missed ? 'closed' : 'done';
  if (missed) return 'closed';
  if (view.state === 'between') return answered ? 'thanks' : 'next';
  return 'waiting';
}

function Notice({ title, texts, eyebrow }: { title: string; texts: string[]; eyebrow: string }) {
  return (
    <div class="skjerm live-melding">
      <div class="eyebrow anim">{eyebrow}</div>
      <h1 class="anim" tabIndex={-1}>
        {title}
      </h1>
      {texts.map((t) => (
        <p class="anim" key={t}>
          {t}
        </p>
      ))}
    </div>
  );
}

export function LivePoll({ code }: { code: string }) {
  const [land, setLand] = useState<Landscape | null>(null);
  const [view, setView] = useState<LiveView | null>(null);
  const [fatal, setFatal] = useState<RunnerError | null>(null);
  const [offline, setOffline] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<LiveDraft>({ lang: null, items: {} });
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [missed, setMissed] = useState<string | null>(null);
  const [answered, setAnswered] = useState<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const lastOpen = useRef<string | null>(null);
  const busy = useRef(false);
  const pollNow = useRef<() => void>(() => undefined);

  useEffect(() => {
    let active = true;
    void liveDraftKey(code).then((k) => {
      if (!active) return;
      setKey(k);
      setDraft(loadLiveDraft(k));
    });
    return () => {
      active = false;
    };
  }, [code]);

  const update = useCallback(
    (next: LiveDraft) => {
      setDraft(next);
      if (key) saveLiveDraft(key, next);
    },
    [key],
  );

  /** A new state: a question that closed while it was on screen without an answer is «missed». */
  const onView = useCallback((v: LiveView) => {
    const prev = lastOpen.current;
    const now = v.state === 'open' ? v.question.id : null;
    if (prev && prev !== now) {
      const item = draftRef.current.items[prev];
      setMissed(item?.confirmed ? null : prev);
      setAnswered(item?.confirmed ? prev : null);
    }
    if (now && now !== prev) setMissed(null);
    lastOpen.current = now;
    setView(v);
  }, []);

  useEffect(() => {
    let stopped = false,
      running = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (running || stopped) return;
      running = true;
      clearTimeout(timer);
      try {
        const v = await loadLive(code);
        if (stopped) return;
        setOffline(false);
        onView(v);
      } catch (e) {
        if (stopped) return;
        if (e instanceof RunnerError && e.status !== 0 && e.status < 500) {
          stopped = true;
          setFatal(e);
          if (e.status === 410) void expireCodeDrafts(code).catch(() => undefined);
          return;
        }
        setOffline(true);
      } finally {
        running = false;
      }
      if (!stopped)
        timer = setTimeout(() => void tick(), document.hidden ? HIDDEN_POLL_MS : POLL_MS);
    };
    pollNow.current = () => void tick();
    void tick();
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [code, onView]);

  const lang: Lang = draft.lang && view?.languages.includes(draft.lang) ? draft.lang : 'nn';
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const question = view?.state === 'open' ? view.question : null;
  const item = question ? draft.items[question.id] : undefined;
  const locked = sending || item?.request !== undefined;

  /** Sends the answer to the open question once; a retry sends the same bytes again. */
  const send = async () => {
    if (!question || busy.current || !key) return;
    const current = draftRef.current.items[question.id] ?? { submission_id: crypto.randomUUID() };
    if (current.confirmed || current.closed) return;
    const value = current.value;
    if (value === undefined || !canContinue(question, value)) return;
    busy.current = true;
    setSending(true);
    setSendError(false);
    const frozen = {
      ...current,
      request: current.request ?? liveRequest(current, question.id, value, lang),
    };
    update({ ...draftRef.current, items: { ...draftRef.current.items, [question.id]: frozen } });
    const outcome = await sendAnswer(code, frozen.request);
    const items = draftRef.current.items;
    if (outcome === 'sent') {
      update({
        ...draftRef.current,
        items: { ...items, [question.id]: { ...frozen, confirmed: true } },
      });
      setAnswered(question.id);
    } else if (outcome === 'closed') {
      update({
        ...draftRef.current,
        items: { ...items, [question.id]: { ...frozen, closed: true } },
      });
      pollNow.current();
    } else setSendError(true);
    busy.current = false;
    setSending(false);
  };

  const choose = (value: AnswerValue) => {
    if (!question || locked) return;
    const current = draftRef.current.items[question.id] ?? { submission_id: crypto.randomUUID() };
    update({
      ...draftRef.current,
      items: { ...draftRef.current.items, [question.id]: { ...current, value } },
    });
  };

  const screen = fatal ? 'fatal' : liveScreen(view, draft, missed, answered);
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);
  useEnter(main, `${screen}:${question?.id ?? ''}`, 1);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    main.current?.querySelector<HTMLElement>('h1[tabindex]')?.focus({ preventScroll: true });
  }, [screen, question?.id]);
  useEffect(() => {
    if (land) direct(land, fatal ? stateOf(fatal) : 'intro', EMPTY, { of: '', top: '' }, true);
  }, [land, fatal]);

  const t = (k: UiKey) => ui(lang, k);
  const topic = view ? ((lang === 'en' ? view.topic.en : undefined) ?? view.topic.nn) : '';
  const eyebrow = topic || t('liveEyebrow');
  const buttons: BarButton[] =
    screen === 'question' && question && (question.type === 'multi' || sendError)
      ? [
          {
            id: 'send',
            label: t(sending ? 'liveSender' : sendError ? 'provIgjen' : 'liveSend'),
            kind: 'next',
            full: true,
            busy: sending,
            disabled: sending || !canContinue(question, item?.value),
            onClick: () => void send(),
          },
        ]
      : [];

  return (
    <Shell
      lang={lang}
      languages={view?.languages ?? []}
      setLang={(l) => update({ ...draftRef.current, lang: l })}
      locked={sending}
      onLand={setLand}
    >
      <main id="main" class="app live" ref={main}>
        {fatal ? (
          <StateScreen kind={stateOf(fatal)} lang={lang} />
        ) : screen === 'loading' ? (
          <StateScreen kind="loading" lang={lang} />
        ) : screen === 'question' && question && view?.state === 'open' ? (
          <>
            <QuestionRenderer
              key={question.id}
              question={question}
              answers={item?.value === undefined ? {} : { [question.id]: item.value }}
              free={{}}
              lang={lang}
              section={t('liveEyebrow')}
              number={{ i: view.no, n: view.total }}
              onAnswer={choose}
              onFree={() => undefined}
              onAdvance={() => void send()}
            />
            {sendError && (
              <div role="alert" class="feilmelding anim">
                <Icon name="varsel" />
                <span>{t('liveSendFeil')}</span>
              </div>
            )}
            <p class="live-anonym anim">{t('liveAnonym')}</p>
          </>
        ) : screen === 'thanks' ? (
          <Notice
            eyebrow={eyebrow}
            title={t('liveTakkTittel')}
            texts={[t('liveTakkTekst'), t('liveNesteTekst')]}
          />
        ) : screen === 'closed' ? (
          <Notice eyebrow={eyebrow} title={t('liveStengtTittel')} texts={[t('liveStengtTekst')]} />
        ) : screen === 'done' ? (
          <Notice eyebrow={eyebrow} title={t('liveFerdigTittel')} texts={[t('liveFerdigTekst')]} />
        ) : screen === 'next' ? (
          <Notice eyebrow={eyebrow} title={t('liveVentTittel')} texts={[t('liveNesteTekst')]} />
        ) : (
          <Notice
            eyebrow={eyebrow}
            title={t('liveVentTittel')}
            texts={[t('liveVentTekst'), t('liveAnonym')]}
          />
        )}
        {offline && !fatal && (
          <p class="live-nett" role="status">
            {t('liveNett')}
          </p>
        )}
      </main>
      <ActionBar buttons={buttons} hidden={buttons.length === 0} lang={lang} />
    </Shell>
  );
}
