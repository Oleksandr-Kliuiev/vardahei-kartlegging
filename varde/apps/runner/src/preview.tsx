// Admin-only preview uses the real renderer and branching. It has no storage, progress or submit path.
import { useEffect, useState } from 'preact/hooks';
import { prune, type Answers, type AnswerValue } from '@varde/rules/runner';
import { TemplateVersionContent } from '@varde/schema/template/validate';
import type { TemplateContent } from '@varde/schema/template/template';
import type { Lang } from '@varde/schema/template/texts';
import { QuestionRenderer, canContinue } from './renderers.js';
import { steps } from './path.js';
import { text, ui } from './i18n/ui.js';
import { Intro, Finish } from './intro-finish.js';
import type { Landscape } from './landscape/landscape.js';
import { direct, type Screen } from './scene.js';
import { LeaderScreen, ReviewScreen } from './screens.js';
import { ActionBar, Shell, type BarButton } from './shell.js';
import { isQuestion, trailState } from './trail.js';

const NOTICE = 'Førehandsvising — ingen svar blir lagra';

export function Preview({ id }: { id: string }) {
  const [content, setContent] = useState<TemplateContent | null>(null);
  const [error, setError] = useState('');
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
        setContent(TemplateVersionContent.parse(body.content));
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Kunne ikkje opne førehandsvisinga.');
      });
    return () => controller.abort();
  }, [id]);
  return content ? (
    <PreviewSurvey content={content} />
  ) : (
    <main class="app">
      <p role={error ? 'alert' : 'status'}>{error || 'Hentar førehandsvising …'}</p>
    </main>
  );
}

export function PreviewSurvey({ content }: { content: TemplateContent }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [free, setFree] = useState<Record<string, string>>({});
  const [lang, setLang] = useState<Lang>('nn');
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);
  const [land, setLand] = useState<Landscape | null>(null);
  const path = steps(content, answers),
    current = path[step];
  const screen: Screen = done
    ? 'summit'
    : step < 0
      ? 'intro'
      : current === 'B-intro'
        ? 'leader'
        : current
          ? 'q'
          : 'review';
  const trail = trailState(path, step, answers, done, false);
  const key = `${trail.questions.length}:${trail.sections.join(',')}`;
  useEffect(() => {
    if (land) void land.layout(trail.sections.length, trail.sections, true);
  }, [land, key]);
  useEffect(() => {
    if (land) direct(land, screen, trail, { of: ui(lang, 'av'), top: ui(lang, 'toppen') }, false);
  }, [land, screen, step, key, lang]);
  const advance = () => setStep((n) => Math.min(n + 1, path.length));
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
          ? [
              {
                id: 'tilbake',
                label: ui(lang, 'tilbake'),
                kind: 'back',
                onClick: () => setStep((n) => Math.max(-1, n - 1)),
              },
            ]
          : [
              {
                id: 'tilbake',
                label: ui(lang, 'tilbake'),
                kind: 'back',
                onClick: () => setStep((n) => Math.max(-1, n - 1)),
              },
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
        {done ? (
          <Finish version={content} answers={answers} lang={lang} client="Førehandsvising" />
        ) : step < 0 ? (
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
