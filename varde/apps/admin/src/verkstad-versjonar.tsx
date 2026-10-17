// «Versjonar» (2.16): the versions of the survey — who published each and when, which rounds use it —
// and what changed from the one before, question by question.
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { Icon } from './icons.js';
import { longDate } from './overview.js';
import type { EditorVersion, VersionSummary } from './survey-models.js';
import { diffQuestions } from './verkstad-tekst.js';

export function Versjonar(p: {
  versions: VersionSummary[];
  current: string;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  const [shown, setShown] = useState<string | null>(null);
  const list = [...p.versions].sort((a, b) => b.version_no - a.version_no);
  return (
    <aside
      className="vk-skuff vk-versjonar"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vk-ver-tittel"
    >
      <header className="vk-skuff-topp">
        <h2 id="vk-ver-tittel">Versjonar</h2>
        <button ref={close} type="button" className="iconbtn" aria-label="Lukk" onClick={p.onClose}>
          <Icon name="lukk" />
        </button>
      </header>
      <ol className="vk-skuff-innhald vk-ver-liste">
        {list.map((v, i) => {
          const before = list[i + 1];
          const rounds = v.rounds ?? 0;
          return (
            <li
              key={v.id}
              className="vk-ver"
              aria-current={v.id === p.current ? 'true' : undefined}
            >
              <p className="vk-ver-tittel">
                <span className={v.status === 'published' ? 'chip ok' : 'chip warn'}>
                  {v.status === 'published' ? 'Publisert' : 'Utkast'} v{v.version_no}
                </span>
                {v.id === p.current && <span className="vk-dempa">Opna no</span>}
              </p>
              <p className="vk-dempa">
                {v.status === 'published' && v.published_at
                  ? `Publisert ${longDate(new Date(v.published_at))}${v.published_by ? ` av ${v.published_by}` : ''}`
                  : v.created_at
                    ? `Laga ${longDate(new Date(v.created_at))}`
                    : 'Utkast'}
                {' · '}
                {rounds
                  ? `brukt i ${rounds} ${rounds === 1 ? 'runde' : 'rundar'}`
                  : 'ikkje brukt i rundar'}
              </p>
              <div className="vk-knappar">
                {v.id !== p.current && (
                  <button type="button" className="btn sm" onClick={() => p.onOpen(v.id)}>
                    Opne v{v.version_no}
                  </button>
                )}
                {before && (
                  <button
                    type="button"
                    className="btn sm ghost"
                    aria-expanded={shown === v.id}
                    onClick={() => setShown(shown === v.id ? null : v.id)}
                  >
                    Kva endra seg frå v{before.version_no}?
                  </button>
                )}
              </div>
              {before && shown === v.id && <Endringar before={before.id} after={v.id} />}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

const one = (id: string) => ({
  queryKey: ['surveys', 'version', id],
  queryFn: () => api<EditorVersion>(`/api/admin/surveys/versions/${id}`),
});

/** New, changed and removed questions between two versions (moves are no change). */
export function Endringar({ before, after }: { before: string; after: string }) {
  const a = useQuery(one(before)),
    b = useQuery(one(after));
  if (!a.data || !b.data)
    return <p role="status">{a.error || b.error ? 'Kunne ikkje hente versjonane.' : 'Hentar …'}</p>;
  const d = diffQuestions(a.data.content, b.data.content);
  if (!d.added.length && !d.changed.length && !d.removed.length)
    return <p className="vk-dempa">Ingen spørsmål er nye, endra eller fjerna.</p>;
  const text = (q: { id: string; texts: { text: { nn: string } } }) =>
    `${q.id} «${q.texts.text.nn || 'utan tekst'}»`;
  return (
    <ul className="vk-endringar">
      {d.added.map((q) => (
        <li key={`n-${q.id}`}>
          <span className="chip accent">Ny</span> {text(q)}
        </li>
      ))}
      {d.changed.map(({ now }) => (
        <li key={`e-${now.id}`}>
          <span className="chip warn">Endra</span> {text(now)}
        </li>
      ))}
      {d.removed.map((q) => (
        <li key={`f-${q.id}`}>
          <span className="chip">Fjerna</span> {text(q)}
        </li>
      ))}
    </ul>
  );
}
