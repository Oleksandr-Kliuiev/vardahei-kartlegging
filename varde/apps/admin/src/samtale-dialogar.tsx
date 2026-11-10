// The side panels of «Samtalar» (2.20): a new round of conversations and more clients for a round, each
// with a long list of clients to tick. The start of one conversation is a dialog (samtale-start.tsx).
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { mutate } from './api.js';
import { Icon } from './icons.js';
import { Kundeval } from './kundeval.js';
import type { Client } from './models.js';
import { ErrorMessage } from './queries.js';
import type { Guide, RoundSummary } from './samtale-models.js';
import { HoldButton } from './widgets.js';

/** A panel from the right; Escape and the veil close it (not an Escape the ⌘K palette has used). */
export function Skuff(p: {
  title: string;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const id = useId();
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && p.onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [p.onClose]);
  return (
    <>
      <div className="sm-slor" onClick={p.onClose} />
      <aside className="sm-skuff" role="dialog" aria-modal="true" aria-labelledby={id}>
        <form onSubmit={p.onSubmit} noValidate>
          <div className="sm-skuff-topp">
            <h2 id={id}>{p.title}</h2>
            <button type="button" className="iconbtn" aria-label="Lukk" onClick={p.onClose}>
              <Icon name="lukk" small />
            </button>
          </div>
          <div className="sm-skuff-innhald">{p.children}</div>
          <div className="sm-skuff-fot">{p.footer}</div>
        </form>
      </aside>
    </>
  );
}

export function NyRunde(p: {
  guides: Guide[];
  clients: Client[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [guide, setGuide] = useState(p.guides[0]?.id ?? '');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    mutate<{ id: string }>('/api/admin/interview-rounds', 'POST', {
      name,
      template_version_id: guide,
      clients: chosen,
    })
      .then((r) => p.onCreated(r.id))
      .catch((err: unknown) => setError(err instanceof Error ? err : new Error('Noko gjekk gale.')))
      .finally(() => setBusy(false));
  };
  return (
    <Skuff
      title="Ny samtalerunde"
      onClose={p.onClose}
      onSubmit={submit}
      footer={
        <>
          <ErrorMessage error={error} />
          <button className="btn primary" disabled={busy || !name.trim() || !guide}>
            Lag runda
          </button>
        </>
      }
    >
      <label className="field">
        <span>Namn</span>
        <input
          className="input"
          value={name}
          placeholder="Til dømes «Haust 2026 · BIO»"
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </label>
      <label className="field">
        <span>Samtaleguide</span>
        <select className="input" value={guide} onChange={(e) => setGuide(e.target.value)}>
          {p.guides.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title} · {g.label} · {g.question_count} spørsmål
            </option>
          ))}
        </select>
      </label>
      <Kundeval clients={p.clients} chosen={chosen} onChange={setChosen} legend="Kundar" />
    </Skuff>
  );
}

export function LeggTilKundar(p: {
  round: { id: string; name: string };
  clients: Client[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    mutate(`/api/admin/interview-rounds/${p.round.id}/clients`, 'POST', { clients: chosen })
      .then(p.onDone)
      .catch((err: unknown) => setError(err instanceof Error ? err : new Error('Noko gjekk gale.')))
      .finally(() => setBusy(false));
  };
  return (
    <Skuff
      title={`Legg til kundar i ${p.round.name}`}
      onClose={p.onClose}
      onSubmit={submit}
      footer={
        <>
          <ErrorMessage error={error} />
          <button className="btn primary" disabled={busy || !chosen.length}>
            Legg til {chosen.length || ''}
          </button>
        </>
      }
    >
      {p.clients.length ? (
        <Kundeval clients={p.clients} chosen={chosen} onChange={setChosen} legend="Kundar" />
      ) : (
        <p className="muted">Alle kundane er alt med i runda.</p>
      )}
    </Skuff>
  );
}

/**
 * «Endre runda» (10.11): the name of a round that exists, and the end of the tour. A typo in a name
 * used to stand for good, and a round that was over kept its place in the chooser beside the one in
 * use. Closing deletes nothing and opening the round again undoes it, so the panel says as much.
 */
export function EndreRunde(p: {
  round: RoundSummary;
  onClose: () => void;
  onDone: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(p.round.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const open = p.round.status === 'open';
  const left = p.round.counts.total - p.round.counts.done;
  // Nobody has sat down in it yet: it can go. One conversation, and the round keeps everything.
  const untouched = p.round.counts.done === 0 && p.round.counts.in_progress === 0;
  const run = (work: Promise<unknown>) => {
    setBusy(true);
    setError(null);
    work
      .then(() => p.onDone())
      .catch((err: unknown) => setError(err instanceof Error ? err : new Error('Noko gjekk gale.')))
      .finally(() => setBusy(false));
  };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    run(mutate(`/api/admin/interview-rounds/${p.round.id}/name`, 'PUT', { name: name.trim() }));
  };
  return (
    <Skuff
      title={`Endre ${p.round.name}`}
      onClose={p.onClose}
      onSubmit={submit}
      footer={
        <>
          <ErrorMessage error={error} />
          <button
            className="btn primary"
            disabled={busy || !name.trim() || name.trim() === p.round.name}
          >
            Lagre namnet
          </button>
          <button type="button" className="btn ghost" onClick={p.onClose}>
            Avbryt
          </button>
        </>
      }
    >
      <label className="field">
        <span>Namn på runda</span>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </label>
      <div className="sm-rundestell">
        <h3>{open ? 'Avslutt runda' : 'Runda er avslutta'}</h3>
        <p className="forklaring">
          {open
            ? `Runda blir ikkje sletta. Ho går ut av veljaren, og du kan korkje leggje til kundar
               eller starte nye samtalar i henne. Samtalar som alt er i gang gjer du ferdig som før,
               og referata er like lesbare. Du kan opne runda att når som helst.`
            : `Du kan ikkje starte nye samtalar i henne. Opne henne att for å halde fram.`}
        </p>
        {open && left > 0 && (
          <p className="forklaring">
            {left} av {p.round.counts.total}{' '}
            {p.round.counts.total === 1 ? 'samtale er' : 'samtalar er'} ikkje fullførte.
          </p>
        )}
        <button
          type="button"
          className={open ? 'btn sm fare' : 'btn sm'}
          disabled={busy}
          onClick={() =>
            run(
              mutate(
                `/api/admin/interview-rounds/${p.round.id}/${open ? 'close' : 'reopen'}`,
                'POST',
              ),
            )
          }
        >
          {open ? 'Avslutt runda' : 'Opne runda att'}
        </button>
      </div>
      <div className="sm-rundestell">
        <h3>Slett runda</h3>
        {untouched ? (
          <>
            <p className="forklaring">
              Ingen har sett seg ned i henne enno, så runda og dei {p.round.counts.total}{' '}
              {p.round.counts.total === 1 ? 'planlagde samtalen' : 'planlagde samtalane'} blir borte
              for godt. Det kan ikkje angrast.
            </p>
            <HoldButton
              className="fare"
              label="Slett runda"
              hint="Hald inne knappen i over eitt sekund. Runda er tom og blir borte."
              disabled={busy}
              onConfirm={() => {
                setBusy(true);
                setError(null);
                mutate(`/api/admin/interview-rounds/${p.round.id}`, 'DELETE')
                  .then(() => p.onDeleted())
                  .catch((err: unknown) =>
                    setError(err instanceof Error ? err : new Error('Noko gjekk gale.')),
                  )
                  .finally(() => setBusy(false));
              }}
            />
          </>
        ) : (
          <p className="forklaring">
            Her er det alt samtalar, så runda kan ikkje slettast. Avslutt henne i staden. Skal det
            som er skrive bort, gjer du det per kunde under «Personvern → Sletting».
          </p>
        )}
      </div>
    </Skuff>
  );
}
