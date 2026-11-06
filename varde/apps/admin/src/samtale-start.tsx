// «Start samtale» (2.20), as in the concept: a dialog in the middle of the screen with the guide of the
// round, who sits at the table from the client (a role and, if they want, a name), who comes from
// Vardahei (names to tick) and the day. Until the conversation is finished, «Endre» in its header opens
// the same dialog to correct the people and the day; the API takes both through the same call.
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { mutate } from './api.js';
import { Icon } from './icons.js';
import { ErrorMessage } from './queries.js';
import { type Person, plain, today } from './samtale-models.js';

/** At most six from each side, with the lengths the API takes. */
const MOST = 6;
const ROLE = 80;
const NAME = 120;
const OURS = 80;

/** One line as the API takes it: no control characters and no half characters. */
const line = (s: string) => s.replace(/\p{Cc}/gu, ' ').replace(/\p{Cs}/gu, '�');

/** Each name once, whatever its case and spaces; the first spelling stays. */
export function unique(names: readonly string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const key = name.toLocaleLowerCase('nn');
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** A dialog in the middle of the screen; Escape and a press on the veil close it. */
export function Dialog(p: {
  title: string;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const id = useId();
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && p.onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [p.onClose]);
  return (
    <div className="sm-dlg-slor" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className="sm-dlg" role="dialog" aria-modal="true" aria-labelledby={id}>
        <form onSubmit={p.onSubmit} noValidate>
          <h2 id={id}>{p.title}</h2>
          {p.children}
          <div className="sm-dlg-fot">{p.footer}</div>
        </form>
      </div>
    </div>
  );
}

export interface StartRow {
  id: string;
  client: { name: string };
  held_on: string | null;
  interviewees: readonly Person[];
  interviewers: readonly string[];
}
export interface StartSent {
  held_on: string;
  interviewees: Person[];
  interviewers: string[];
}
interface Who {
  key: number;
  role: string;
  name: string;
}

/** What the dialog opens with: the people saved so far, or a «dagleg leiar» and the one signed in. */
function first(p: { row: StartRow; names: readonly string[]; me: string | null }) {
  const chosen = unique(p.row.interviewers.length ? p.row.interviewers : p.me ? [p.me] : []);
  // Once each in the order they came (the first spelling stays), then by name.
  const rest = unique(p.names).sort((a, b) => a.localeCompare(b, 'nn'));
  const from: readonly Person[] = p.row.interviewees.length
    ? p.row.interviewees
    : [{ role: 'dagleg leiar' }];
  return {
    people: from.map((x, key): Who => ({ key, role: x.role, name: x.name ?? '' })),
    offered: unique([...chosen, ...(p.me ? [p.me] : []), ...rest]),
    ours: new Set(chosen),
  };
}

export function StartSamtale(p: {
  row: StartRow;
  guide: { title: string; label: string; question_count: number } | null;
  /** Names from Vardahei used before in the round, offered as boxes to tick. */
  names: readonly string[];
  me: string | null;
  /** «Endre» from the header of a conversation that is going on. */
  edit?: boolean;
  onClose: () => void;
  onDone: (sent: StartSent) => void;
}) {
  const uid = useId();
  const [start] = useState(() => first(p));
  const [people, setPeople] = useState(start.people);
  const [offered, setOffered] = useState(start.offered);
  const [ours, setOurs] = useState(start.ours);
  // Another name from Vardahei: null until «Legg til namn» opens the field (open at once with no names).
  const [other, setOther] = useState<string | null>(start.offered.length ? null : '');
  const [day, setDay] = useState(p.row.held_on ?? today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const role = useRef<HTMLInputElement>(null);
  useEffect(() => role.current?.focus(), []);
  // A new row takes the focus in its role field.
  useEffect(() => {
    if (added !== null) document.getElementById(`${uid}-rolle-${added}`)?.focus();
  }, [added, uid]);

  const set = (key: number, patch: Partial<Who>) =>
    setPeople((list) => list.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const addPerson = () => {
    const key = Math.max(-1, ...people.map((x) => x.key)) + 1;
    setPeople([...people, { key, role: '', name: '' }]);
    setAdded(key);
  };
  const toggle = (name: string) => {
    const next = new Set(ours);
    if (next.has(name)) next.delete(name);
    else if (next.size < MOST) next.add(name);
    setOurs(next);
  };
  const addOther = () => {
    const name = (other ?? '').trim();
    if (!name) return;
    const known = offered.find((n) => n.toLocaleLowerCase('nn') === name.toLocaleLowerCase('nn'));
    if (!known) setOffered([...offered, name]);
    if (ours.size < MOST) setOurs(new Set(ours).add(known ?? name));
    setOther('');
  };
  const otherKeys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addOther();
    } else if (e.key === 'Escape' && other) {
      // A first Escape empties the field; the next one closes the dialog.
      e.stopPropagation();
      setOther('');
    }
  };

  const nameless = people.some((x) => !x.role.trim() && x.name.trim());
  const ready = people.some((x) => x.role.trim()) && !nameless && /^\d{4}-\d{2}-\d{2}$/.test(day);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!ready || busy) return;
    const sent: StartSent = {
      held_on: day,
      interviewees: people
        .filter((x) => x.role.trim())
        .map((x) =>
          x.name.trim() ? { role: x.role.trim(), name: x.name.trim() } : { role: x.role.trim() },
        ),
      // A name typed but not yet added counts as ticked.
      interviewers: unique([
        ...offered.filter((n) => ours.has(n)),
        ...(other ? [other] : []),
      ]).slice(0, MOST),
    };
    setBusy(true);
    setError(null);
    mutate(`/api/admin/interviews/${p.row.id}/start`, 'POST', sent)
      .then(() => p.onDone(sent))
      .catch((err: unknown) => setError(plain(err)))
      .finally(() => setBusy(false));
  };

  const many = people.length > 1;
  return (
    <Dialog
      title={`${p.edit ? 'Endre samtalen med' : 'Start samtale med'} ${p.row.client.name}`}
      onClose={p.onClose}
      onSubmit={submit}
      footer={
        <>
          <ErrorMessage error={error} />
          <span className="sm-dlg-knappar">
            <button type="button" className="btn ghost" onClick={p.onClose}>
              Avbryt
            </button>
            <button className="btn primary" disabled={busy || !ready}>
              {p.edit ? 'Lagre' : 'Start samtalen'}
              {!p.edit && <Icon name="pil" small />}
            </button>
          </span>
        </>
      }
    >
      {p.guide && (
        <p className="sm-dlg-guide">
          <Icon name="skjema" small />
          <span>
            {p.guide.title} · {p.guide.label} · {p.guide.question_count} spørsmål
          </span>
        </p>
      )}
      <fieldset className={many ? 'sm-folk sm-folk-fleire' : 'sm-folk'}>
        <legend>Kven er med frå kunden?</legend>
        {people.map((x, n) => (
          <div key={x.key} className="sm-person">
            <input
              ref={n === 0 ? role : undefined}
              id={`${uid}-rolle-${x.key}`}
              className="input"
              value={x.role}
              maxLength={ROLE}
              placeholder="Rolle"
              aria-label={n ? `Rolle, person ${n + 1}` : 'Rolle'}
              aria-invalid={!x.role.trim() && !!x.name.trim()}
              onChange={(e) => set(x.key, { role: line(e.target.value) })}
            />
            <input
              className="input"
              value={x.name}
              maxLength={NAME}
              placeholder="Namn (valfritt)"
              aria-label={n ? `Namn, person ${n + 1} (valfritt)` : 'Namn (valfritt)'}
              onChange={(e) => set(x.key, { name: line(e.target.value) })}
            />
            {many &&
              (n > 0 ? (
                <button
                  type="button"
                  className="ikonknapp sm-fjern"
                  aria-label={`Fjern person ${n + 1}`}
                  title="Fjern"
                  onClick={() => setPeople(people.filter((y) => y.key !== x.key))}
                >
                  <Icon name="lukk" small />
                </button>
              ) : (
                <span />
              ))}
          </div>
        ))}
        {nameless && <p className="sm-dlg-feil">Skriv rolla til alle som er med.</p>}
        {people.length < MOST && (
          <button type="button" className="linkbtn sm-nytt-notat" onClick={addPerson}>
            <Icon name="pluss" small />
            Legg til person
          </button>
        )}
      </fieldset>
      <fieldset className="sm-folk">
        <legend>Frå Vardahei</legend>
        {offered.length > 0 && (
          <div className="sm-vi">
            {offered.map((name) => (
              <label key={name} className="sm-vi-namn">
                <input
                  type="checkbox"
                  checked={ours.has(name)}
                  disabled={!ours.has(name) && ours.size >= MOST}
                  onChange={() => toggle(name)}
                />
                {name}
              </label>
            ))}
          </div>
        )}
        {other === null ? (
          <button type="button" className="linkbtn sm-nytt-notat" onClick={() => setOther('')}>
            <Icon name="pluss" small />
            Legg til namn
          </button>
        ) : (
          <div className="sm-anna">
            <input
              className="input"
              value={other}
              maxLength={OURS}
              placeholder="Namn"
              aria-label="Namn frå Vardahei"
              autoFocus={offered.length > 0}
              onChange={(e) => setOther(line(e.target.value))}
              onKeyDown={otherKeys}
            />
            <button type="button" className="btn" disabled={!other.trim()} onClick={addOther}>
              Legg til
            </button>
          </div>
        )}
      </fieldset>
      <label className="field">
        <span>Dato</span>
        <input
          className="input"
          type="date"
          value={day}
          required
          aria-invalid={!/^\d{4}-\d{2}-\d{2}$/.test(day)}
          onChange={(e) => setDay(e.target.value)}
        />
      </label>
    </Dialog>
  );
}
