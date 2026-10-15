import { schemaMessage } from './schema-message.js';
import { useEffect, useState } from 'react';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import type { Question } from '../../../packages/schema/src/template/question.js';
import type { EditorVersion } from './survey-models.js';
import { api, mutate } from './api.js';
import { ErrorMessage } from './queries.js';
import { JsonField, ObjectFields, type Issue, type Json } from './editor-fields.js';
import { newQuestion, QuestionEditor, localized } from './question-editor.js';
import { PhonePreview } from './phone-preview.js';

const base = (id: string) => `/api/admin/surveys/versions/${id}`;
export function SurveyEditor({
  initial,
  changed,
}: {
  initial: EditorVersion;
  changed: () => void;
}) {
  const [saved, setSaved] = useState(initial),
    [content, setContent] = useState(initial.content);
  const [issues, setIssues] = useState<Issue[]>([]),
    [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const [marks, setMarks] = useState<Json>({}),
    [message, setMessage] = useState('');
  const readonly = saved.status === 'published';
  const dirty = JSON.stringify(saved.content) !== JSON.stringify(content);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      void api<{ issues: Issue[] }>('/api/admin/surveys/validate', {
        method: 'POST',
        body: JSON.stringify(content),
        signal: abort.signal,
      })
        .then((r) => {
          if (!abort.signal.aborted) setIssues(r.issues);
        })
        .catch((e: unknown) => {
          if (!abort.signal.aborted)
            setError(e instanceof Error ? e : new Error('Kunne ikkje validere.'));
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [content]);
  function work(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setMessage('');
    void fn()
      .catch((e: unknown) => setError(e instanceof Error ? e : new Error('Kunne ikkje lagre.')))
      .finally(() => setBusy(false));
  }
  async function applyJson(candidate: unknown) {
    setBusy(true);
    try {
      const result = await mutate<{ issues: Issue[] }>(
        '/api/admin/surveys/validate',
        'POST',
        candidate as object,
      );
      setIssues(result.issues);
      if (result.issues.length) throw new Error('Kontroller felta i feillista før du bruker JSON.');
      setContent(candidate as TemplateContent);
    } finally {
      setBusy(false);
    }
  }
  const replace = (n: number, q: Question) =>
    setContent({ ...content, questions: content.questions.map((x, i) => (i === n ? q : x)) });
  const move = (n: number, to: number) => {
    const questions = [...content.questions],
      [q] = questions.splice(n, 1);
    if (q) questions.splice(to, 0, q);
    setContent({ ...content, questions });
  };
  function section(index: number, action: 'up' | 'down' | 'remove') {
    const starts = [
      0,
      ...content.questions.flatMap((q, i) => (i > 0 && q.texts.section_title ? [i] : [])),
    ];
    const groups = starts.map((start, i) =>
      content.questions.slice(start, starts[i + 1] ?? content.questions.length),
    );
    const n = starts.indexOf(index);
    if (action === 'remove') groups.splice(n, 1);
    else {
      const to = action === 'up' ? n - 1 : n + 1;
      if (to < 0 || to >= groups.length) return;
      [groups[n], groups[to]] = [groups[to]!, groups[n]!];
    }
    setContent({ ...content, questions: groups.flat() });
  }
  return (
    <section className="del redigering">
      <h2>
        {saved.label} · {readonly ? 'Publisert' : 'Utkast'}
      </h2>
      <PhonePreview id={saved.id} content={content} />
      <ErrorMessage error={error} />
      <p role="status">{message}</p>
      <div className="knappar">
        <button
          disabled={busy}
          onClick={() =>
            work(async () => {
              const next = await api<EditorVersion>(base(saved.id));
              setSaved(next);
              setContent(next.content);
              setConfirm(false);
            })
          }
        >
          Hent lagra versjon på nytt
        </button>
        <a
          className="knapp"
          href={`/r?preview=${saved.id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Førehandsvis lagra versjon
        </a>
      </div>
      {dirty && (
        <p>
          Du har endringar som ikkje er lagra. Telefonen viser dei alt; «Førehandsvis lagra versjon»
          viser den lagra versjonen.
        </p>
      )}
      <fieldset disabled={readonly || busy} className="editor-form">
        <legend>Innhald</legend>
        <label>
          Identifikasjon
          <select
            aria-label="Identifikasjon"
            value={content.identification}
            onChange={(e) =>
              setContent({ ...content, identification: e.target.value as 'initials' | 'none' })
            }
          >
            <option value="initials">Initialar</option>
            <option value="none">Anonym</option>
          </select>
        </label>
        <div className="knappar">
          {(['nn', 'en', 'nb'] as const).map((lang) => (
            <label key={lang}>
              <input
                type="checkbox"
                checked={content.required_languages.includes(lang)}
                disabled={lang === 'nn' || (lang === 'en' && content.audience === 'client_survey')}
                onChange={(e) =>
                  setContent({
                    ...content,
                    required_languages: e.target.checked
                      ? [...content.required_languages, lang]
                      : content.required_languages.filter((l) => l !== lang),
                  })
                }
              />
              {lang}
            </label>
          ))}
        </div>
        <details>
          <summary>Innleiing, kontakt, invitasjon og andre skjemafelt</summary>
          <ObjectFields
            value={Object.fromEntries(
              Object.entries(content).filter(
                ([k]) =>
                  ![
                    'questions',
                    'key',
                    'audience',
                    'identification',
                    'required_languages',
                  ].includes(k),
              ),
            )}
            languages={content.required_languages}
            issues={issues}
            onChange={(v) => setContent({ ...content, ...(v as object) })}
          />
          <JsonField
            label="Skjemafelt som JSON (utan spørsmål)"
            value={Object.fromEntries(Object.entries(content).filter(([k]) => k !== 'questions'))}
            onChange={(v) => applyJson({ ...(v as object), questions: content.questions })}
          />
        </details>
        {content.questions.map((q, i) => (
          <article className="question-card" key={i}>
            {(i === 0 || q.texts.section_title) && (
              <div className="knappar">
                <strong>Seksjon: {q.texts.section_title?.nn ?? 'Utan tittel'}</strong>
                <button type="button" onClick={() => section(i, 'up')}>
                  Seksjon opp
                </button>
                <button type="button" onClick={() => section(i, 'down')}>
                  Seksjon ned
                </button>
                <button type="button" onClick={() => section(i, 'remove')}>
                  Fjern seksjon
                </button>
              </div>
            )}
            <details>
              <summary>
                {q.id}: {q.texts.text.nn || 'Nytt spørsmål'}
              </summary>
              <QuestionEditor
                question={q}
                questions={content.questions}
                index={i}
                languages={content.required_languages}
                issues={issues}
                onChange={(next) => replace(i, next)}
                onJsonChange={(v) =>
                  applyJson({
                    ...content,
                    questions: content.questions.map((x, n) => (n === i ? v : x)),
                  })
                }
              />
            </details>
            <div className="knappar">
              <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)}>
                Opp
              </button>
              <button
                type="button"
                disabled={i === content.questions.length - 1}
                onClick={() => move(i, i + 1)}
              >
                Ned
              </button>
              <button
                type="button"
                onClick={() =>
                  setContent({ ...content, questions: content.questions.filter((_, n) => n !== i) })
                }
              >
                Fjern spørsmål
              </button>
            </div>
          </article>
        ))}
        <div className="knappar">
          {['Legg til spørsmål', 'Legg til seksjon'].map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                let n = content.questions.length + 1;
                while (content.questions.some((q) => q.id === `Q${n}`)) n++;
                const q = newQuestion('single', `Q${n}`, content.required_languages);
                if (i) q.texts.section_title = localized(content.required_languages, 'Ny seksjon');
                setContent({ ...content, questions: [...content.questions, q] });
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      {issues.length > 0 && (
        <details open>
          <summary>Kontroller {issues.length} felt</summary>
          <ul>
            {issues.map((i, n) => (
              <li key={n} role="alert">
                {i.path.join('.')}: {schemaMessage(i.message)}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!readonly && (
        <div className="editor-form">
          <button
            disabled={busy}
            onClick={() =>
              work(async () => {
                const result = await mutate<EditorVersion>(base(saved.id), 'PUT', {
                  content_hash: saved.content_hash,
                  content,
                });
                setSaved(result);
                setContent(result.content);
                setConfirm(false);
                changed();
                setMessage('Utkastet er lagra.');
              })
            }
          >
            Lagre utkast
          </button>
          <div className="knappar">
            {saved.required_languages.map((lang) => (
              <button
                key={lang}
                disabled={busy || dirty}
                onClick={() =>
                  work(async () => {
                    await mutate(`${base(saved.id)}/accept`, 'POST', {
                      content_hash: saved.content_hash,
                      lang,
                    });
                    setSaved(await api<EditorVersion>(base(saved.id)));
                    setMessage(`Teksten på ${lang} er godkjend.`);
                    changed();
                  })
                }
              >
                Godkjenn {lang}
                {saved.translation_acceptance[lang] ? ' ✓' : ''}
              </button>
            ))}
          </div>
          <details>
            <summary>Endra frosne spørsmål</summary>
            <p>
              Oppgi spørsmåls-ID og «orthographic» eller «semantic». Semantiske endringar krev ny
              anchor_key.
            </p>
            <JsonField
              label="Endringar i frosne spørsmål (JSON)"
              value={marks}
              onChange={setMarks}
            />
          </details>
          <label>
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            Eg stadfestar publisering. Versjonen kan ikkje endrast etterpå.
          </label>
          <button
            disabled={busy || dirty || !confirm}
            onClick={() =>
              work(async () => {
                await mutate(`${base(saved.id)}/publish`, 'POST', {
                  content_hash: saved.content_hash,
                  confirmed: true,
                  frozen_changes: marks,
                });
                const v = await api<EditorVersion>(base(saved.id));
                setSaved(v);
                setContent(v.content);
                changed();
                setMessage('Versjonen er publisert.');
              })
            }
          >
            Publiser versjonen
          </button>
        </div>
      )}
    </section>
  );
}
