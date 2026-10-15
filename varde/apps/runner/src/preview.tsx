// Admin-only preview uses the real renderer and branching. It has no storage, progress or submit path.
import { useEffect, useState } from 'preact/hooks';
import { prune, type Answers, type AnswerValue } from '@varde/rules/runner';
import { TemplateVersionContent } from '@varde/schema/template/validate';
import type { TemplateContent } from '@varde/schema/template/template';
import type { Lang } from '@varde/schema/template/texts';
import { QuestionRenderer, canContinue } from './renderers.js';
import { steps } from './path.js';
import { text } from './i18n/ui.js';
import { Intro, Finish } from './intro-finish.js';

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
    <main class="wrap">
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
  const path = steps(content, answers),
    current = path[step];
  const advance = () => setStep((n) => Math.min(n + 1, path.length));
  const answer = (v: AnswerValue) => {
    if (current && current !== 'B-intro')
      setAnswers((a) => prune(content, { ...a, [current.id]: v }));
  };
  return (
    <div class="wrap">
      <header>
        <strong>Førehandsvising — ingen svar blir lagra</strong>
        <div class="sprak">
          {content.required_languages.map((l) => (
            <button onClick={() => setLang(l)} aria-pressed={lang === l}>
              {l}
            </button>
          ))}
        </div>
      </header>
      <main aria-live="polite">
        {done ? (
          <Finish version={content} answers={answers} lang={lang} />
        ) : step < 0 ? (
          <Intro version={content} client="Førehandsvising" lang={lang} start={advance} />
        ) : current === 'B-intro' ? (
          <div class="skjerm">
            <h2>{text(content.leader_intro.title, lang)}</h2>
            <p>{text(content.leader_intro.text, lang)}</p>
          </div>
        ) : current ? (
          <QuestionRenderer
            key={current.id}
            question={current}
            answers={answers}
            free={free}
            lang={lang}
            onAnswer={answer}
            onFree={(v) => setFree({ ...free, [current.id]: v })}
            onAdvance={advance}
          />
        ) : (
          <button onClick={() => setDone(true)}>Sjå avslutninga</button>
        )}
      </main>
      {step >= 0 && !done && (
        <nav class="nav">
          <div class="nav-inn">
            <button onClick={() => setStep((n) => Math.max(-1, n - 1))}>Tilbake</button>
            {current && current !== 'B-intro' && !current.required && (
              <button
                onClick={() => {
                  const next = { ...answers };
                  delete next[current.id];
                  setAnswers(prune(content, next));
                  advance();
                }}
              >
                Hopp over
              </button>
            )}
            {current && (
              <button
                disabled={current !== 'B-intro' && !canContinue(current, answers[current.id])}
                onClick={advance}
              >
                Vidare
              </button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
