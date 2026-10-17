// Live phone preview in the survey workshop (1.46, 2.15): the real runner preview in a frame. The draft
// is posted as it is (same origin only); the phone follows the question chosen on the trail
// (`varde:forhand-ga`) and tells where it is when someone answers in it (`varde:forhand-her`).
import { useEffect, useRef, useState } from 'react';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';

export function PhonePreview({
  id,
  content,
  at,
  note,
  ask = 0,
  onHere,
}: {
  id: string;
  content: TemplateContent;
  /** A question id, or `:intro`, `:leiar` and `:slutt`. */
  at?: string;
  /** Counts the choices on the trail, so a click on the chosen question brings the phone back to it. */
  ask?: number;
  /** The condition in words, shown when the current answers hide the question. */
  note?: string;
  onHere?: (at: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const heard = useRef<string | null>(null);
  // The spot asked for last: the phone confirming it is no move of its own (a section asks for its
  // first question, and the trail must stay on the section).
  const asked = useRef<string | null>(null);
  const here = useRef(onHere);
  here.current = onHere;
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow) return;
      const m = e.data as { type?: unknown; at?: unknown } | null;
      if (m?.type === 'varde:forhand-klar') setReady(true);
      else if (m?.type === 'varde:forhand-her' && typeof m.at === 'string') {
        heard.current = m.at;
        if (m.at !== asked.current) here.current?.(m.at);
        asked.current = null;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  useEffect(() => setReady(false), [id]);
  const post = (data: object) => frame.current?.contentWindow?.postMessage(data, location.origin);
  // The draft first, then the question: a question added a moment ago exists in the phone only after it.
  // The phone already shows what it just reported, so asking for that again would only fight its own step.
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      post({ type: 'varde:forhand-innhald', content });
      if (at && at !== heard.current) {
        asked.current = at;
        post({ type: 'varde:forhand-ga', to: at, ...(note ? { note } : {}) });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [content, at, ask, ready]);
  return (
    <aside className="telefon-wrap" aria-label="Førehandsvising på telefon">
      <div className="telefon">
        <iframe
          key={id}
          ref={frame}
          title="Førehandsvising på telefon"
          src={`/r?preview=${encodeURIComponent(id)}`}
        />
      </div>
      <small>
        Telefonen viser det valde spørsmålet. Svar i han for å prøve vilkåra. Ingen svar blir lagra.
      </small>
    </aside>
  );
}
