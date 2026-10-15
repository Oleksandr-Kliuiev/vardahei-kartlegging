import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { prune, type AnswerValue, type Answers } from '@varde/rules/runner';
import type { Lang } from '@varde/schema/template/texts';
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
import { Finish, Intro } from './intro-finish.js';
import type { Landscape } from './landscape/landscape.js';
import { useEnter } from './motion-hooks.js';
import { steps } from './path.js';
import { progressSession, sendProgress } from './progress.js';
import { canContinue, QuestionRenderer } from './renderers.js';
import type { RunnerRound } from './round.js';
import { direct, type Screen, type Trail } from './scene.js';
import { LeaderScreen, ReviewScreen, StateScreen } from './screens.js';
import { ActionBar, Shell, type BarButton } from './shell.js';
import { sendDraft } from './submission.js';
import { isQuestion, trailState, type TrailState } from './trail.js';

export interface Topbar {
  lang: Lang;
  languages?: readonly Lang[];
  setLang?: (l: Lang) => void;
  locked?: boolean;
}

/** The survey with its own frame (logo, language, landscape); the language switch reflects the session. */
export function Survey({ round }: { round: RunnerRound }) {
  const [land, setLand] = useState<Landscape | null>(null);
  const [top, setTop] = useState<Topbar>({
    lang: defaultLanguage(round.version.required_languages, round.client.default_lang),
  });
  return (
    <Shell {...top} onLand={setLand}>
      <SurveyLoader round={round} land={land} setTopbar={setTop} />
    </Shell>
  );
}

function SurveyLoader({
  round,
  land,
  setTopbar,
}: {
  round: RunnerRound;
  land: Landscape | null;
  setTopbar: (t: Topbar) => void;
}) {
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
      <main id="main" class="app">
        <StateScreen kind="loading" lang="nn" />
      </main>
    );
  return (
    <SurveySession
      round={round}
      code={code}
      storageKey={loaded.key}
      initial={loaded.draft}
      land={land}
      setTopbar={setTopbar}
    />
  );
}

const sceneTrail = (t: TrailState): Trail => ({
  sections: t.sections,
  marks: t.marks,
  at: t.at,
  lastCommon: t.lastCommon,
  no: t.no,
  total: t.total,
  leaderCount: t.leaderCount,
});
const layoutKey = (t: TrailState) => `${t.questions.length}:${t.sections.join(',')}`;

function SurveySession({
  round,
  code,
  storageKey,
  initial,
  land,
  setTopbar,
}: {
  round: RunnerRound;
  code: string;
  storageKey: string;
  initial: Draft;
  land: Landscape | null;
  setTopbar: ((t: Topbar) => void) | undefined;
}) {
  const version = round.version.content;
  const [draft, setDraft] = useState(initial);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);
  const [fromReview, setFromReview] = useState(false);
  const [dir, setDir] = useState(1);
  const [session] = useState(() => progressSession(`progress:${storageKey}`));
  const { answers, free, lang } = draft;
  const path = steps(version, answers);
  const step = Math.min(draft.step, path.length);
  const current = path[step];
  const locked = sending || draft.requests !== undefined || draft.confirmed?.common === true;
  const screen: Screen = done
    ? 'summit'
    : step === -1
      ? 'intro'
      : current === 'B-intro'
        ? 'leader'
        : current
          ? 'q'
          : 'review';
  const trail = trailState(path, step, answers, done, draft.skip_leader === true);
  const main = useRef<HTMLElement>(null);
  const screenNow = useRef(screen);
  screenNow.current = screen;

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
  const setLang = useCallback((l: Lang) => setDraft((d) => ({ ...d, lang: l })), []);
  useEffect(() => {
    setTopbar?.({
      lang,
      languages: round.version.required_languages,
      setLang,
      locked: locked || done,
    });
  }, [lang, locked, done]);

  // The landscape follows the survey: dots and cairns for the path, then camera, hiker and bubble for the screen.
  const laidOut = useRef(''),
    first = useRef(true);
  useEffect(() => {
    if (!land) return;
    const instant = first.current;
    first.current = false;
    if (laidOut.current !== layoutKey(trail)) {
      void land.layout(trail.sections.length, trail.sections, instant);
      laidOut.current = layoutKey(trail);
    }
    direct(
      land,
      screen,
      sceneTrail(trail),
      { of: ui(lang, 'av'), top: ui(lang, 'toppen') },
      instant,
      () => screenNow.current === screen,
    );
  }, [land, screen, step, layoutKey(trail), lang]);

  /** The hiker sets off as soon as the answer is given, before the next question is on screen. */
  function walkAhead(nextAnswers: Answers, from: number) {
    if (!land) return;
    const p = steps(version, nextAnswers),
      to = Math.min(from + 1, p.length),
      next = p[to];
    const t = trailState(p, to, nextAnswers, false, draft.skip_leader === true);
    if (laidOut.current !== layoutKey(t)) {
      void land.layout(t.sections.length, t.sections);
      laidOut.current = layoutKey(t);
    }
    if (fromReview || !next) return void land.walkTo(land.endX);
    if (next === 'B-intro') return void land.walkTo(land.checkX(t.lastCommon) + 6);
    void land.walkTo(land.checkX(t.at));
    land.bubble(true, { i: t.no, total: t.total, of: ui(lang, 'av') });
  }
  const advance = () => {
    setDir(1);
    if (fromReview) {
      if (land) void land.walkTo(land.endX);
      setFromReview(false);
      setDraft((d) => ({ ...d, step: steps(version, d.answers).length }));
      return;
    }
    walkAhead(answers, step);
    setDraft((d) => ({ ...d, step: Math.min(step + 1, path.length) }));
  };
  const back = () => {
    setDir(-1);
    setFromReview(false);
    setDraft((d) => ({ ...d, step: Math.max(-1, step - 1) }));
  };
  const answer = (value: AnswerValue) => {
    if (!isQuestion(current)) return;
    const next = prune(version, { ...answers, [current.id]: value });
    // A single choice moves on by itself after a moment: let the hiker start now.
    if (
      current.type === 'single' &&
      current.free_text === undefined &&
      canContinue(current, value) &&
      !fromReview
    )
      walkAhead(next, step);
    setDraft((d) => ({ ...d, answers: prune(version, { ...d.answers, [current.id]: value }) }));
  };
  const skip = () => {
    if (!isQuestion(current)) return;
    const nextAnswers = { ...answers },
      nextFree = { ...free };
    delete nextAnswers[current.id];
    delete nextFree[current.id];
    const clean = prune(version, nextAnswers);
    setDir(1);
    if (!fromReview) walkAhead(clean, step);
    setDraft({
      ...draft,
      answers: clean,
      free: nextFree,
      step: fromReview
        ? steps(version, clean).length
        : Math.min(step + 1, steps(version, clean).length),
    });
    setFromReview(false);
  };
  const edit = (id: string) => {
    const at = path.findIndex((s) => isQuestion(s) && s.id === id);
    if (at < 0) return;
    setDir(-1);
    setFromReview(true);
    setDraft((d) => ({ ...d, step: at }));
  };
  const submit = async (skipLeader = false) => {
    if (sending) return;
    setSending(true);
    setError(false);
    // He heads for the summit while the answers are on their way.
    if (land) void land.walkTo(land.topStop);
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
      setDir(1);
      setDone(true);
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  };

  useEnter(main, `${screen}:${step}`, dir);
  useLayoutEffect(() => {
    if (!first.current)
      main.current?.querySelector<HTMLElement>('h1[tabindex]')?.focus({ preventScroll: true });
  }, [screen, step]);

  const sectionOf = (i: number) => {
    for (let k = i; k >= 0; k--) {
      const q = trail.questions[k];
      if (q?.texts.section_title) return text(q.texts.section_title, lang);
      if (q && k < i && q.part !== trail.questions[i]?.part) break;
    }
    return trail.questions[i]?.part === 'leader' ? ui(lang, 'leiarEyebrow') : undefined;
  };
  const buttons: BarButton[] =
    screen === 'intro'
      ? [{ id: 'start', label: ui(lang, 'start'), kind: 'next', full: true, onClick: advance }]
      : screen === 'q' && isQuestion(current)
        ? [
            {
              id: 'tilbake',
              label: ui(lang, 'tilbake'),
              kind: 'back',
              disabled: locked,
              onClick: back,
            },
            ...(!current.required
              ? [
                  {
                    id: 'hopp',
                    label: ui(lang, 'hopp'),
                    kind: 'skip' as const,
                    disabled: locked,
                    onClick: skip,
                  },
                ]
              : []),
            {
              id: 'vidare',
              label: ui(lang, fromReview ? 'tilOversyn' : 'vidare'),
              kind: 'next',
              disabled: locked || !canContinue(current, answers[current.id]),
              onClick: advance,
            },
          ]
        : screen === 'leader'
          ? [
              {
                id: 'tilbake',
                label: ui(lang, 'tilbake'),
                kind: 'back',
                disabled: locked,
                onClick: back,
              },
            ]
          : screen === 'review'
            ? [
                {
                  id: 'tilbake',
                  label: ui(lang, 'tilbake'),
                  kind: 'back',
                  disabled: locked,
                  onClick: back,
                },
                {
                  id: 'send',
                  label: ui(lang, sending ? 'sender' : error ? 'provIgjen' : 'send'),
                  kind: 'next',
                  busy: sending,
                  disabled: sending,
                  onClick: () => void submit(),
                },
              ]
            : [];

  return (
    <>
      <main id="main" class="app" ref={main}>
        {done ? (
          <Finish version={version} answers={answers} lang={lang} client={round.client.name} />
        ) : step === -1 ? (
          <Intro version={version} client={round.client.name} lang={lang} />
        ) : current === 'B-intro' ? (
          <LeaderScreen
            version={version}
            lang={lang}
            count={trail.leaderCount}
            error={error}
            sending={sending}
            onTake={advance}
            onSkip={() => void submit(true)}
          />
        ) : current ? (
          <QuestionRenderer
            key={current.id}
            question={current}
            answers={answers}
            free={free}
            lang={lang}
            section={sectionOf(trail.at)}
            number={{ i: trail.no, n: trail.total }}
            onAnswer={answer}
            onFree={(value) => setDraft({ ...draft, free: { ...free, [current.id]: value } })}
            onAdvance={advance}
          />
        ) : (
          <ReviewScreen
            version={version}
            questions={trail.questions.filter((q) => trail.leaderChosen || q.part !== 'leader')}
            answers={answers}
            lang={lang}
            error={error}
            locked={locked}
            onEdit={edit}
          />
        )}
      </main>
      <ActionBar buttons={buttons} hidden={buttons.length === 0} lang={lang} />
    </>
  );
}
