// Admin-only preview uses the real renderer and branching. It has no storage, progress or submit path.
// In the workshop's phone frame (2.15) the admin page sends the draft as it is (`varde:forhand-innhald`,
// shape only: an unfinished draft is shown as far as it goes), moves the phone to a question
// (`varde:forhand-ga`) and hears where the phone is (`varde:forhand-her`). Same origin, the parent only.
import { useEffect, useErrorBoundary, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { prune, type Answers, type AnswerValue } from '@varde/rules/runner';
import { TemplateContentShape, type TemplateContent } from '@varde/schema/template/template';
import type { Question } from '@varde/schema/template/question';
import type { Lang } from '@varde/schema/template/texts';
import { QuestionRenderer, canContinue } from './renderers.js';
import { steps, type Step } from './path.js';
import { text, ui } from './i18n/ui.js';
import { Intro, Finish } from './intro-finish.js';
import type { Landscape } from './landscape/landscape.js';
import { direct, type Screen } from './scene.js';
import { LeaderScreen, ReviewScreen } from './screens.js';
import { ActionBar, Shell, type BarButton } from './shell.js';
import { isQuestion, trailState } from './trail.js';

const NOTICE = 'Førehandsvising — ingen svar blir lagra';
const UNFINISHED =
  'Førehandsvisinga kan ikkje vise utkastet slik det er no. Sjå kva som manglar i redigeringa.';

/** Where the phone is: a question id, or `:intro`, `:leiar`, `:oversikt` and `:slutt` (ids never start with «:»). */
export type Spot = string;
export interface Goal {
  to: Spot;
  /** Shown above a question the current answers hide (the condition, in words). */
  note?: string;
  /** Counts the requests, so the same spot can be asked for twice. */
  n: number;
}

export function Preview({ id }: { id: string }) {
  const [content, setContent] = useState<TemplateContent | null>(null);
  const [error, setError] = useState('');
  const [goal, setGoal] = useState<Goal | null>(null);
  const framed = window.parent !== window;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/admin/surveys/versions/${encodeURIComponent(id)}/preview`, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('Førehandsvisinga krev innlogging og eit gyldig utkast.');
        const body = (await r.json()) as { content: unknown };
        const parsed = TemplateContentShape.safeParse(body.content);
        if (!parsed.success) throw new Error(UNFINISHED);
        setContent(parsed.data);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Kunne ikkje opne førehandsvisinga.');
      });
    return () => controller.abort();
  }, [id]);
  useEffect(() => {
    if (!framed) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== window.parent) return;
      const m = e.data as {
        type?: unknown;
        content?: unknown;
        to?: unknown;
        note?: unknown;
      } | null;
      if (m?.type === 'varde:forhand-innhald') {
        const parsed = TemplateContentShape.safeParse(m.content);
        if (parsed.success) setContent(parsed.data);
      } else if (m?.type === 'varde:forhand-ga' && typeof m.to === 'string' && m.to.length <= 100) {
        const to = m.to;
        const note = typeof m.note === 'string' ? m.note.slice(0, 300) : undefined;
        setGoal((g) => ({ to, ...(note ? { note } : {}), n: (g?.n ?? 0) + 1 }));
      }
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'varde:forhand-klar' }, location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  const here = (at: Spot) => {
    if (framed) window.parent.postMessage({ type: 'varde:forhand-her', at }, location.origin);
  };
  return content ? (
    <Guard content={content}>
      <PreviewSurvey content={content} goal={goal} onHere={here} />
    </Guard>
  ) : (
    <main class="app">
      <p role={error ? 'alert' : 'status'}>{error || 'Hentar førehandsvising …'}</p>
    </main>
  );
}

/** An unfinished draft may still break a renderer; the phone then says so and tries again on the next draft. */
function Guard({ content, children }: { content: TemplateContent; children: ComponentChildren }) {
  const [error, reset] = useErrorBoundary() as [unknown, () => void];
  useEffect(() => {
    if (error) reset();
  }, [content]);
  return error ? (
    <main class="app">
      <p role="alert">{UNFINISHED}</p>
    </main>
  ) : (
    <>{children}</>
  );
}

/** The role answer that opens the leader part, unless the current one already does. */
function asLeader(content: TemplateContent, answers: Answers): Answers {
  const role = content.questions.find((q) => q.role);
  const leader = content.leader_roles[0];
  const now = role ? answers[role.id] : undefined;
  if (
    !role ||
    leader === undefined ||
    (typeof now === 'string' && content.leader_roles.includes(now))
  )
    return answers;
  return prune(content, { ...answers, [role.id]: leader });
}

/** The last step of `path` that comes before `q` in the template (−1: before the first question). */
function stepBefore(content: TemplateContent, path: readonly Step[], q: Question): number {
  const order = (s: Step) =>
    isQuestion(s) ? content.questions.findIndex((x) => x.id === s.id) : -1;
  const at = content.questions.findIndex((x) => x.id === q.id);
  let i = -1;
  path.forEach((s, n) => {
    if (s === 'B-intro' ? q.part === 'leader' : order(s) < at) i = n;
  });
  return i;
}

export function PreviewSurvey({
  content,
  goal = null,
  onHere,
}: {
  content: TemplateContent;
  goal?: Goal | null;
  onHere?: (at: Spot) => void;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [free, setFree] = useState<Record<string, string>>({});
  const [lang, setLang] = useState<Lang>('nn');
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);
  // A question the current answers hide, shown because the workshop asked for it.
  const [forced, setForced] = useState<{ q: Question; note: string } | null>(null);
  const [land, setLand] = useState<Landscape | null>(null);
  const path = steps(content, answers),
    current = forced ? forced.q : path[step];
  const screen: Screen = done
    ? 'summit'
    : forced
      ? 'q'
      : step < 0
        ? 'intro'
        : current === 'B-intro'
          ? 'leader'
          : current
            ? 'q'
            : 'review';
  const trail = trailState(path, step, answers, done, false);
  const key = `${trail.questions.length}:${trail.sections.join(',')}`;
  const at: Spot = done
    ? ':slutt'
    : screen === 'intro'
      ? ':intro'
      : current === 'B-intro'
        ? ':leiar'
        : isQuestion(current)
          ? current.id
          : ':oversikt';
  useEffect(() => {
    if (land) void land.layout(trail.sections.length, trail.sections, true);
  }, [land, key]);
  useEffect(() => {
    if (land) direct(land, screen, trail, { of: ui(lang, 'av'), top: ui(lang, 'toppen') }, false);
  }, [land, screen, step, key, lang]);
  useEffect(() => onHere?.(at), [at]);
  useEffect(() => {
    if (!goal) return;
    const to = goal.to;
    if (to === ':intro' || to === ':slutt') {
      setForced(null);
      setDone(to === ':slutt');
      if (to === ':intro') setStep(-1);
      return;
    }
    const q = to.startsWith(':') ? undefined : content.questions.find((x) => x.id === to);
    if (to !== ':leiar' && !q) return;
    const a = to === ':leiar' || q?.part === 'leader' ? asLeader(content, answers) : answers;
    if (a !== answers) setAnswers(a);
    const p = steps(content, a);
    const i = q ? p.findIndex((s) => isQuestion(s) && s.id === q.id) : p.indexOf('B-intro');
    setDone(false);
    if (i >= 0) {
      setForced(null);
      setStep(i);
    } else if (q) {
      setForced({ q, note: goal.note ?? '' });
      setStep(stepBefore(content, p, q));
    }
  }, [goal?.n]);
  const advance = () => {
    setForced(null);
    setStep((n) => Math.min(n + 1, path.length));
  };
  const back = () => {
    if (forced) setForced(null);
    else setStep((n) => Math.max(-1, n - 1));
  };
  const answer = (v: AnswerValue) => {
    if (isQuestion(current)) setAnswers((a) => prune(content, { ...a, [current.id]: v }));
  };
  const skip = () => {
    if (!isQuestion(current)) return;
    const next = { ...answers };
    delete next[current.id];
    setAnswers(prune(content, next));
    advance();
  };
  const buttons: BarButton[] =
    screen === 'intro'
      ? [{ id: 'start', label: ui(lang, 'start'), kind: 'next', full: true, onClick: advance }]
      : screen === 'summit'
        ? []
        : screen === 'leader'
          ? [{ id: 'tilbake', label: ui(lang, 'tilbake'), kind: 'back', onClick: back }]
          : [
              { id: 'tilbake', label: ui(lang, 'tilbake'), kind: 'back', onClick: back },
              ...(isQuestion(current) && !current.required
                ? [{ id: 'hopp', label: ui(lang, 'hopp'), kind: 'skip' as const, onClick: skip }]
                : []),
              screen === 'review'
                ? {
                    id: 'send',
                    label: 'Sjå avslutninga',
                    kind: 'next' as const,
                    onClick: () => setDone(true),
                  }
                : {
                    id: 'vidare',
                    label: ui(lang, 'vidare'),
                    kind: 'next' as const,
                    disabled: isQuestion(current) && !canContinue(current, answers[current.id]),
                    onClick: advance,
                  },
            ];
  return (
    <Shell lang={lang} languages={content.required_languages} setLang={setLang} onLand={setLand}>
      <p class="forhand" role="note">
        {NOTICE}
      </p>
      <main class="app">
        {forced && (
          <p class="forhand-skjult" role="note">
            {forced.note || 'Svara du har gitt no, skjuler dette spørsmålet.'}
          </p>
        )}
        {done ? (
          <Finish version={content} answers={answers} lang={lang} client="Førehandsvising" />
        ) : screen === 'intro' ? (
          <Intro version={content} client="Førehandsvising" lang={lang} />
        ) : current === 'B-intro' ? (
          <LeaderScreen
            version={content}
            lang={lang}
            count={trail.leaderCount}
            error={false}
            sending={false}
            onTake={advance}
            onSkip={() => setDone(true)}
          />
        ) : current ? (
          <QuestionRenderer
            key={current.id}
            question={current}
            answers={answers}
            free={free}
            lang={lang}
            section={
              current.texts.section_title ? text(current.texts.section_title, lang) : undefined
            }
            number={{ i: trail.no, n: trail.total }}
            onAnswer={answer}
            onFree={(v) => setFree({ ...free, [current.id]: v })}
            onAdvance={advance}
          />
        ) : (
          <ReviewScreen
            version={content}
            questions={trail.questions}
            answers={answers}
            lang={lang}
            error={false}
            locked={false}
            onEdit={(id) => setStep(path.findIndex((s) => isQuestion(s) && s.id === id))}
          />
        )}
      </main>
      <ActionBar buttons={buttons} hidden={buttons.length === 0} lang={lang} />
    </Shell>
  );
}
