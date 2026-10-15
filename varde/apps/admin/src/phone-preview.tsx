// Live phone preview in the template editor (1.46): the real runner preview in a frame. Unsaved changes are
// posted to it (same origin only); the runner accepts them only from its parent and only if they pass the schema.
import { useEffect, useRef, useState } from 'react';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';

export function PhonePreview({ id, content }: { id: string; content: TemplateContent }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow) return;
      if ((e.data as { type?: unknown } | null)?.type === 'varde:forhand-klar') setReady(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  useEffect(() => setReady(false), [id]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(
      () =>
        frame.current?.contentWindow?.postMessage(
          { type: 'varde:forhand-innhald', content },
          location.origin,
        ),
      250,
    );
    return () => clearTimeout(timer);
  }, [content, ready]);
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
      <small>Endringar blir viste med ein gong, også før du lagrar. Ingen svar blir lagra.</small>
    </aside>
  );
}
