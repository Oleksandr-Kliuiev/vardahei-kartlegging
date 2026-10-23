// «Slett seminaret» (3.5): a coming seminar goes with its registrations, materials and links; the
// words say what goes before the button does it. A held seminar, or one whose rounds were opened,
// is refused by the server (it keeps the answers of the rounds).
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mutate } from './api.js';
import { Icon } from './icons.js';
import { go, type Seminar } from './seminar-models.js';
import { useToast } from './shell.js';

type Target = Pick<Seminar, 'id' | 'topic_nn' | 'registrations'>;

/** The question with the consequence in words, and the two buttons. */
export function SlettSporsmal({
  s,
  onCancel,
  onDone,
}: {
  s: Target;
  onCancel: () => void;
  onDone?: () => void;
}) {
  const queries = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    setBusy(true);
    setError('');
    try {
      await mutate(`/api/admin/seminars/${s.id}`, 'DELETE');
      void queries.invalidateQueries({ queryKey: ['seminars'] });
      toast(`«${s.topic_nn}» er sletta.`);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikkje slette seminaret.');
      setBusy(false);
    }
  }
  const n = s.registrations.total;
  return (
    <div className="sem-sporsmal" role="group" aria-label={`Stadfest sletting av ${s.topic_nn}`}>
      <p>
        «{s.topic_nn}» blir sletta
        {n > 0 ? ` saman med ${n} ${n === 1 ? 'påmelding' : 'påmeldingar'}` : ''}. Funn du tok opp i
        seminaret blir opne att. Det kan ikkje angrast.
      </p>
      {error && (
        <p role="alert" className="sem-sporsmal-feil">
          {error}
        </p>
      )}
      <div className="handlingar">
        <button type="button" className="btn sm fare" disabled={busy} onClick={() => void remove()}>
          <Icon name="slett" small />
          Slett seminaret
        </button>
        <button type="button" className="btn sm ghost" disabled={busy} onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </div>
  );
}

/** The seminar page: a quiet button that opens the question. */
export function SlettSeminar({ s }: { s: Target }) {
  const [asking, setAsking] = useState(false);
  if (asking)
    return (
      <SlettSporsmal
        s={s}
        onCancel={() => setAsking(false)}
        onDone={() => go(null, '/admin/seminars')}
      />
    );
  return (
    <button type="button" className="btn sm ghost fare" onClick={() => setAsking(true)}>
      <Icon name="slett" small />
      Slett seminaret
    </button>
  );
}
