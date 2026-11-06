// The side panels of «Samtalar» (2.20): a new round of conversations, more clients for a round, and the
// start of one conversation (who sits at the table and when).
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { mutate } from './api.js';
import { Icon } from './icons.js';
import type { Client } from './models.js';
import { ErrorMessage } from './queries.js';
import { type Guide, type InterviewRow, type Person, today } from './samtale-models.js';

/** A panel from the right; Escape and the veil close it. */
export function Skuff(p: {
  title: string;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const id = useId();
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && p.onClose();
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

/** Clients to tick, with a search for a long list. */
function Kundeval({
  clients,
  chosen,
  onChange,
}: {
  clients: Client[];
  chosen: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [find, setFind] = useState('');
  const shown = clients.filter((c) => c.name.toLowerCase().includes(find.trim().toLowerCase()));
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  return (
    <fieldset className="sm-kundeval">
      <legend>
        Kundar <span className="muted">{chosen.size} valde</span>
      </legend>
      <input
        className="input"
        type="search"
        placeholder="Finn kunde"
        aria-label="Finn kunde"
        value={find}
        onChange={(e) => setFind(e.target.value)}
      />
      <div className="sm-kundeliste">
        {shown.map((c) => (
          <label key={c.id} className="sm-kunde">
            <input type="checkbox" checked={chosen.has(c.id)} onChange={() => toggle(c.id)} />
            {c.name}
          </label>
        ))}
        {!shown.length && <p className="muted">Ingen kundar passar.</p>}
      </div>
    </fieldset>
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
  const [chosen, setChosen] = useState(new Set<string>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    mutate<{ id: string }>('/api/admin/interview-rounds', 'POST', {
      name,
      template_version_id: guide,
      clients: [...chosen],
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
      <Kundeval clients={p.clients} chosen={chosen} onChange={setChosen} />
    </Skuff>
  );
}

export function LeggTilKundar(p: {
  round: { id: string; name: string };
  clients: Client[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [chosen, setChosen] = useState(new Set<string>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    mutate(`/api/admin/interview-rounds/${p.round.id}/clients`, 'POST', { clients: [...chosen] })
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
          <button className="btn primary" disabled={busy || !chosen.size}>
            Legg til {chosen.size || ''}
          </button>
        </>
      }
    >
      {p.clients.length ? (
        <Kundeval clients={p.clients} chosen={chosen} onChange={setChosen} />
      ) : (
        <p className="muted">Alle kundane er alt med i runda.</p>
      )}
    </Skuff>
  );
}

export function StartSamtale(p: {
  row: InterviewRow;
  me: string | null;
  onClose: () => void;
  onStarted: (id: string) => void;
}) {
  const [people, setPeople] = useState<Person[]>(
    p.row.interviewees.length ? p.row.interviewees : [{ role: 'dagleg leiar', name: '' }],
  );
  const [ours, setOurs] = useState(p.me ?? '');
  const [day, setDay] = useState(p.row.held_on ?? today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  const interviewers = useMemo(
    () =>
      ours
        .split(/,| og /)
        .map((s) => s.trim())
        .filter(Boolean),
    [ours],
  );
  const set = (n: number, patch: Partial<Person>) =>
    setPeople(people.map((x, k) => (k === n ? { ...x, ...patch } : x)));
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    mutate(`/api/admin/interviews/${p.row.id}/start`, 'POST', {
      held_on: day,
      interviewees: people
        .filter((x) => x.role.trim())
        .map((x) => (x.name?.trim() ? { role: x.role, name: x.name } : { role: x.role })),
      interviewers,
    })
      .then(() => p.onStarted(p.row.id))
      .catch((err: unknown) => setError(err instanceof Error ? err : new Error('Noko gjekk gale.')))
      .finally(() => setBusy(false));
  };
  return (
    <Skuff
      title={`Start samtale med ${p.row.client.name}`}
      onClose={p.onClose}
      onSubmit={submit}
      footer={
        <>
          <ErrorMessage error={error} />
          <button className="btn primary" disabled={busy || !people.some((x) => x.role.trim())}>
            Start samtalen
            <Icon name="pil" small />
          </button>
        </>
      }
    >
      <fieldset className="sm-folk">
        <legend>Kven er med frå kunden?</legend>
        {people.map((x, n) => (
          <div key={n} className="sm-person">
            <label className="field">
              <span>Rolle</span>
              <input
                ref={n === 0 ? first : undefined}
                className="input"
                value={x.role}
                onChange={(e) => set(n, { role: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Namn (valfritt)</span>
              <input
                className="input"
                value={x.name ?? ''}
                onChange={(e) => set(n, { name: e.target.value })}
              />
            </label>
          </div>
        ))}
        {people.length < 6 && (
          <button
            type="button"
            className="linkbtn sm-nytt-notat"
            onClick={() => setPeople([...people, { role: '', name: '' }])}
          >
            <Icon name="pluss" small />
            Legg til person
          </button>
        )}
      </fieldset>
      <label className="field">
        <span>Frå Vardahei</span>
        <input
          className="input"
          value={ours}
          placeholder="Namn, skilde med komma"
          onChange={(e) => setOurs(e.target.value)}
        />
      </label>
      <label className="field">
        <span>Dato</span>
        <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      </label>
    </Skuff>
  );
}
