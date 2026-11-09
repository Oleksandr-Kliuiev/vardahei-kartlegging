// «Innhaldet som fil» (2.16, wave C5): the whole survey out to a file and back in again. A campaign
// is written as JSON beside the repo and used to go into Varde by hand with curl; here the same file
// is picked, read and shown — how many questions it holds, what it changes in the draft open now, and
// what the validator says about it — before anything is replaced. The draft itself is only touched on
// «Bruk innhaldet»: an ordinary edit, so ⌘Z takes it back and the usual save carries it to the server.
import { useRef, useState } from 'react';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import { api } from './api.js';
import { Icon } from './icons.js';
import { issueText, type Issue } from './verkstad-felt.js';
import { diffQuestions } from './verkstad-tekst.js';

/** What the file holds, measured against the draft that is open. */
interface Lesing {
  name: string;
  content: TemplateContent;
  questions: number;
  added: number;
  changed: number;
  removed: number;
  issues: Issue[];
}

const ending = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The campaign files are named after the survey, so the saved one can go straight back in. */
export const fileName = (c: TemplateContent, label: string) =>
  `${c.key}-${label}.json`.replace(/[^a-zA-Z0-9.@_-]+/g, '-').toLowerCase();

/** The content of a file, or the Norwegian reason it cannot be used. */
export function readContent(text: string, now: TemplateContent): TemplateContent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Fila er ikkje gyldig JSON.');
  }
  // A file saved from the editor holds the content itself; one from an API answer wraps it.
  const whole = parsed as { content?: unknown };
  const c = (
    whole && typeof whole === 'object' && whole.content && typeof whole.content === 'object'
      ? whole.content
      : parsed
  ) as Partial<TemplateContent>;
  if (!c || typeof c !== 'object' || Array.isArray(c))
    throw new Error('Fila inneheld ikkje eit skjema.');
  if (!Array.isArray(c.questions) || typeof c.intro !== 'object' || c.intro === null)
    throw new Error('Fila manglar «questions» eller «intro», så ho er ikkje eit skjema.');
  if (c.key !== now.key)
    throw new Error(`Fila er for skjemaet «${String(c.key ?? '')}», ikkje «${now.key}».`);
  if (c.audience !== now.audience) throw new Error('Fila har ei anna målgruppe enn skjemaet.');
  return c as TemplateContent;
}

export function InnhaldFil(p: {
  content: TemplateContent;
  versionLabel: string;
  readOnly: boolean;
  onChange: (c: TemplateContent) => void;
}) {
  const pick = useRef<HTMLInputElement>(null);
  const [lesing, setLesing] = useState<Lesing | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function save() {
    const blob = new Blob([`${JSON.stringify(p.content, null, 2)}\n`], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName(p.content, p.versionLabel);
    a.click();
    URL.revokeObjectURL(url);
  }

  async function take(file: File) {
    setBusy(true);
    setError('');
    setLesing(null);
    try {
      const content = readContent(await file.text(), p.content);
      const d = diffQuestions(p.content, content);
      // The same validator the workshop uses, so the file is judged by one rule set.
      const checked = await api<{ issues: Issue[] }>('/api/admin/surveys/validate', {
        method: 'POST',
        body: JSON.stringify(content),
      }).catch(() => ({ issues: [] as Issue[] }));
      setLesing({
        name: file.name,
        content,
        questions: content.questions.length,
        added: d.added.length,
        changed: d.changed.length,
        removed: d.removed.length,
        issues: checked.issues,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fila kunne ikkje lesast.');
    } finally {
      setBusy(false);
      if (pick.current) pick.current.value = '';
    }
  }

  const blocking = lesing?.issues.filter((i) => i.blocking) ?? [];
  return (
    <div className="vk-fil">
      <p className="vk-hint">
        Heile innhaldet ut til ei fil, eller inn frå ei. Nøkkel og målgruppe må vere dei same.
      </p>
      <div className="vk-knappar">
        <button type="button" className="btn sm" onClick={save}>
          <Icon name="ned" small />
          Lagre innhaldet til fil
        </button>
        {!p.readOnly && (
          <>
            <button
              type="button"
              className="btn sm"
              disabled={busy}
              onClick={() => pick.current?.click()}
            >
              <Icon name="dok" small />
              Hent innhald frå fil …
            </button>
            <input
              ref={pick}
              className="sr-only"
              type="file"
              accept="application/json,.json"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void take(file);
              }}
            />
          </>
        )}
      </div>
      {busy && <p role="status">Les fila …</p>}
      {error && (
        <p role="alert" className="vk-fil-feil">
          {error}
        </p>
      )}
      {lesing && (
        <div className="vk-fil-funn" role="group" aria-label={`Innhaldet i ${lesing.name}`}>
          <p>
            <b>{lesing.name}</b> har {ending(lesing.questions, 'spørsmål', 'spørsmål')}.
          </p>
          <p>
            {lesing.added + lesing.changed + lesing.removed === 0
              ? 'Ingen spørsmål blir nye, endra eller borte: innhaldet er det same som no.'
              : `I høve til utkastet no: ${ending(lesing.added, 'nytt', 'nye')}, ${ending(
                  lesing.changed,
                  'endra',
                  'endra',
                )}, ${ending(lesing.removed, 'fjerna', 'fjerna')}.`}
          </p>
          {blocking.length > 0 ? (
            <>
              <p className="vk-fil-feil">
                {ending(blocking.length, 'ting', 'ting')} i fila må fiksast før ho kan brukast:
              </p>
              <ul className="vk-fil-liste">
                {blocking.slice(0, 5).map((i, n) => (
                  <li key={`${i.path.join('.')}-${n}`}>
                    {issueText(i)} <span className="vk-dempa">({i.path.join(' › ')})</span>
                  </li>
                ))}
                {blocking.length > 5 && (
                  <li className="vk-dempa">… og {blocking.length - 5} til</li>
                )}
              </ul>
            </>
          ) : (
            lesing.issues.length > 0 && (
              <p className="vk-dempa">
                {ending(lesing.issues.length, 'ting', 'ting')} er att å fikse etterpå, men fila kan
                brukast.
              </p>
            )
          )}
          <div className="vk-knappar">
            <button
              type="button"
              className="btn sm primary"
              disabled={blocking.length > 0}
              onClick={() => {
                p.onChange(lesing.content);
                setLesing(null);
              }}
            >
              Bruk innhaldet frå fila
            </button>
            <button type="button" className="btn sm ghost" onClick={() => setLesing(null)}>
              Avbryt
            </button>
          </div>
          <p className="vk-dempa">Angre (⌘Z) tek utkastet attende slik det var.</p>
        </div>
      )}
    </div>
  );
}
