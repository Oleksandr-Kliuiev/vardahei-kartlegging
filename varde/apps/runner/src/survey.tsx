import { useEffect, useState } from 'preact/hooks';
import { prune, type AnswerValue } from '@varde/rules/runner';
import {
  confirmDraft,
  draftKey,
  loadDraft,
  newDraft,
  removeDraft,
  saveDraft,
  type Draft,
} from './draft.js';
import { defaultLanguage, text, ui } from './i18n/ui.js';
import { notice } from './i18n/notice.js';
import { steps } from './path.js';
import { canContinue, QuestionRenderer } from './renderers.js';
import type { RunnerRound } from './round.js';
import { sendDraft } from './submission.js';
import { Intro, Finish } from './intro-finish.js';
import { Profile } from './profile.js';
import { progressSession, sendProgress } from './progress.js';

export function Survey({ round }: { round: RunnerRound }) {
  const [loaded, setLoaded] = useState<{ key: string; draft: Draft } | null>(null);
  const code = new URLSearchParams(location.search).get('c') ?? '';
  useEffect(() => {
    let active = true;
    void draftKey(code, round.version.id).then((key) => {
      const saved = loadDraft(key, round.version.required_languages, round.expires);
      const draft =
        saved ??
        newDraft(
          defaultLanguage(round.version.required_languages, round.client.default_lang),
          round.expires,
        );
      draft.answers = prune(round.version.content, draft.answers);
      draft.step = Math.min(draft.step, steps(round.version.content, draft.answers).length);
      if (active) setLoaded({ key, draft });
    });
    return () => {
      active = false;
    };
  }, [code, round.version.id]);
  if (!loaded)
    return (
      <main class="wrap">
        <p role="status">{ui('nn', 'loading')}</p>
      </main>
    );
  return <SurveySession round={round} code={code} storageKey={loaded.key} initial={loaded.draft} />;
}

function SurveySession({
  round,
  code,
  storageKey,
  initial,
}: {
  round: RunnerRound;
  code: string;
  storageKey: string;
  initial: Draft;
}) {
  const version = round.version.content;
  const [draft, setDraft] = useState(initial);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);
  const [session] = useState(() => progressSession(`progress:${storageKey}`));
  const { answers, free, lang } = draft;
  const path = steps(version, answers);
  const step = Math.min(draft.step, path.length);
  const current = path[step];
  const locked = sending || draft.requests !== undefined || draft.confirmed?.common === true;
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const questionNo = step < 0 ? 0 : path.slice(0, step + 1).filter((s) => s !== 'B-intro').length;
  useEffect(() => {
    sendProgress(code, session, questionNo, done);
  }, [code, session, step, questionNo, done]);
  useEffect(() => {
    if (done || (draft.confirmed?.common && draft.confirmed.leader)) removeDraft(storageKey);
    else saveDraft(storageKey, draft);
  }, [draft, done, storageKey]);
  const advance = () => setDraft((d) => ({ ...d, step: Math.min(step + 1, path.length) }));
  const answer = (value: AnswerValue) => {
    if (current && current !== 'B-intro')
      setDraft((d) => ({ ...d, answers: prune(version, { ...d.answers, [current.id]: value }) }));
  };
  const skip = () => {
    if (!current || current === 'B-intro') return;
    const nextAnswers = { ...answers },
      nextFree = { ...free };
    delete nextAnswers[current.id];
    delete nextFree[current.id];
    const clean = prune(version, nextAnswers);
    setDraft({
      ...draft,
      answers: clean,
      free: nextFree,
      step: Math.min(step + 1, steps(version, clean).length),
    });
  };
  const submit = async (skipLeader = false) => {
    if (sending) return;
    setSending(true);
    setError(false);
    let working = { ...draft, ...(skipLeader ? { skip_leader: true } : {}) };
    try {
      await sendDraft(
        code,
        version,
        working,
        (part) => {
          working = confirmDraft(storageKey, working, part);
          setDraft(working);
        },
        (frozen) => {
          working = { ...frozen };
          saveDraft(storageKey, working);
          setDraft(working);
        },
      );
      setDone(true);
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  };
  return (
    <div class="wrap">
      <header>
        <strong>Vardahei IT</strong>
        <div class="sprak" role="group" aria-label="Språk / Language">
          {round.version.required_languages.map((l) => (
            <button
              type="button"
              id={`sprak-${l}`}
              disabled={locked || done}
              aria-pressed={lang === l}
              onClick={() => setDraft({ ...draft, lang: l })}
            >
              {{ nn: 'Nynorsk', nb: 'Bokmål', en: 'English' }[l]}
            </button>
          ))}
        </div>
      </header>
      {step >= 0 && (
        <Profile
          count={path.filter((s) => s !== 'B-intro').length}
          question={path.slice(0, step + 1).filter((s) => s !== 'B-intro').length}
          done={done}
          lang={lang}
        />
      )}
      <main id="main" aria-live="polite">
        {done ? (
          <Finish version={version} answers={answers} lang={lang} />
        ) : step === -1 ? (
          <Intro version={version} client={round.client.name} lang={lang} start={advance} />
        ) : current === 'B-intro' ? (
          <div class="mellom skjerm" data-step="B-intro">
            <h2>{text(version.leader_intro.title, lang)}</h2>
            <p>{text(version.leader_intro.text, lang)}</p>
            <p data-notice="leader">{notice(lang, 'notice.common.leader_not_anonymous')}</p>
            {error && (
              <p role="alert" class="feil">
                {ui(lang, 'sendFeil')}
              </p>
            )}
            <button
              id="skip-leader"
              class="lenke"
              disabled={sending}
              onClick={() => {
                void submit(true);
              }}
            >
              {ui(lang, 'bHopp')}
            </button>
          </div>
        ) : current ? (
          <QuestionRenderer
            key={current.id}
            question={current}
            answers={answers}
            free={free}
            lang={lang}
            onAnswer={answer}
            onFree={(value) => setDraft({ ...draft, free: { ...free, [current.id]: value } })}
            onAdvance={advance}
          />
        ) : (
          <div class="skjerm" data-step="review">
            <h1>{ui(lang, 'review')}</h1>
            <p>{ui(lang, 'ready')}</p>
            {error && (
              <p role="alert" class="feil">
                {ui(lang, 'sendFeil')}
              </p>
            )}
            <button
              id="send"
              class="knapp hoved"
              disabled={sending}
              onClick={() => {
                void submit();
              }}
            >
              {ui(lang, sending ? 'sender' : error ? 'provIgjen' : 'send')}
            </button>
          </div>
        )}
      </main>
      {step >= 0 && !done && (
        <nav class="nav">
          <div class="nav-inn">
            <button
              class="lenke"
              id="tilbake"
              disabled={locked}
              onClick={() => setDraft({ ...draft, step: Math.max(-1, step - 1) })}
            >
              {ui(lang, 'tilbake')}
            </button>
            {current && current !== 'B-intro' && !current.required && (
              <button class="lenke" id="hopp" disabled={locked} onClick={skip}>
                {ui(lang, 'hopp')}
              </button>
            )}
            {current && (
              <button
                class="knapp hoved"
                id="vidare"
                disabled={
                  locked || (current !== 'B-intro' && !canContinue(current, answers[current.id]))
                }
                onClick={advance}
              >
                {ui(lang, current === 'B-intro' ? 'bStart' : 'vidare')}
              </button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
