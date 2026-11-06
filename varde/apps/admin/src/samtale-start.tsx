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
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** One line as the API takes it: no control characters and no half characters. */
const line = (s: string) => s.replace(/\p{Cc}/gu, ' ').replace(/\p{Cs}/gu, '�');
const same = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('nn') === b.trim().toLocaleLowerCase('nn');

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

/** A dialog in the middle of the screen; Escape and a press on the veil close it, but not while
 * `busy` (the form is on its way), not an Escape another layer has used (the ⌘K palette, a field that
 * empties itself first) and not a press on the veil's own scrollbar (a tall dialog scrolls the veil). */
export function Dialog(p: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const id = useId();
  const { busy = false, onClose } = p;
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !busy) onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [busy, onClose]);
  return (
    <div
      className="sm-dlg-slor"
      onMouseDown={(e) => {
        const veil = e.currentTarget;
        if (e.target !== veil || busy) return;
        // Past clientWidth is the veil's scrollbar (where the browser lays out; tests have no layout).
        if (veil.clientWidth && e.clientX - veil.getBoundingClientRect().left >= veil.clientWidth)
          return;
        onClose();
      }}
    >
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

/** What the dialog opens with: the people saved so far, or a «dagleg leiar» and the one signed in
 * (only at the start: «Endre» never ticks someone who was not saved as there). */
function first(p: { row: StartRow; names: readonly string[]; me: string | null; edit?: boolean }) {
  const saved = p.row.interviewers;
  const chosen = unique(saved.length || p.edit ? saved : p.me ? [p.me] : []);
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
  // Where the focus goes after a change that removes or disables the control that had it.
  const [focus, setFocus] = useState<{ id: string } | null>(null);
  const role = useRef<HTMLInputElement>(null);
  useEffect(() => role.current?.focus(), []);
  useEffect(() => {
    if (focus) document.getElementById(focus.id)?.focus();
  }, [focus]);

  const roleId = (key: number) => `${uid}-rolle-${key}`;
  const set = (key: number, patch: Partial<Who>) =>
    setPeople((list) => list.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const addPerson = () => {
    const key = Math.max(-1, ...people.map((x) => x.key)) + 1;
    setPeople([...people, { key, role: '', name: '' }]);
    setFocus({ id: roleId(key) });
  };
  const removePerson = (n: number) => {
    setPeople(people.filter((_, k) => k !== n));
    setFocus({ id: roleId(people[n - 1]!.key) });
  };
  const full = ours.size >= MOST;
  const toggle = (name: string) => {
    const next = new Set(ours);
    if (next.has(name)) next.delete(name);
    else if (next.size < MOST) next.add(name);
    setOurs(next);
  };
  /** The name typed in «Namn frå Vardahei», in the spelling already offered when there is one. */
  const typed = () => {
    const name = (other ?? '').trim();
    return name ? (offered.find((n) => same(n, name)) ?? name) : null;
  };
  const addOther = () => {
    const name = typed();
    if (!name || full) return;
    const at = offered.includes(name) ? offered.indexOf(name) : offered.length;
    if (at === offered.length) setOffered([...offered, name]);
    setOurs(new Set(ours).add(name));
    setOther('');
    // The field stays for the next name; at six it gives way to the hint, so the new box takes focus.
    setFocus({ id: ours.has(name) || ours.size + 1 < MOST ? `${uid}-anna` : `${uid}-vi-${at}` });
  };
  const otherKeys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addOther();
    } else if (e.key === 'Escape' && other) {
      // A first Escape empties the field; the dialog leaves an Escape that was used alone.
      e.preventDefault();
      setOther('');
    }
  };

  const nameless = people.some((x) => !x.role.trim() && x.name.trim());
  const dayOk = DAY.test(day);
  const ready = people.some((x) => x.role.trim()) && !nameless && dayOk;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!ready || busy) return;
    const pending = full ? null : typed();
    const sent: StartSent = {
      held_on: day,
      interviewees: people
        .filter((x) => x.role.trim())
        .map((x) =>
          x.name.trim() ? { role: x.role.trim(), name: x.name.trim() } : { role: x.role.trim() },
        ),
      // A name typed but not yet added counts as ticked.
      interviewers: unique([...offered.filter((n) => ours.has(n)), ...(pending ? [pending] : [])]),
    };
    setBusy(true);
    setError(null);
    mutate(`/api/admin/interviews/${p.row.id}/start`, 'POST', sent)
      .then(() => p.onDone(sent))
      .catch((err: unknown) => setError(plain(err)))
      .finally(() => setBusy(false));
  };

  const many = people.length > 1;
  const feil = `${uid}-feil`;
  return (
    <Dialog
      title={`${p.edit ? 'Endre samtalen med' : 'Start samtale med'} ${p.row.client.name}`}
      onClose={p.onClose}
      busy={busy}
      onSubmit={submit}
      footer={
        <>
          <ErrorMessage error={error} />
          <span className="sm-dlg-knappar">
            <button type="button" className="btn ghost" disabled={busy} onClick={p.onClose}>
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
        {people.map((x, n) => {
          const missing = !x.role.trim() && !!x.name.trim();
          return (
            <div key={x.key} className="sm-person">
              <input
                ref={n === 0 ? role : undefined}
                id={roleId(x.key)}
                className="input"
                value={x.role}
                maxLength={ROLE}
                placeholder="Rolle"
                aria-label={n ? `Rolle, person ${n + 1}` : 'Rolle'}
                aria-invalid={missing}
                aria-describedby={missing ? feil : undefined}
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
                    onClick={() => removePerson(n)}
                  >
                    <Icon name="lukk" small />
                  </button>
                ) : (
                  <span />
                ))}
            </div>
          );
        })}
        {nameless && (
          <p className="sm-dlg-feil" id={feil} role="alert">
            Skriv rolla til alle som er med.
          </p>
        )}
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
            {offered.map((name, i) => (
              <label key={name} className="sm-vi-namn">
                <input
                  id={`${uid}-vi-${i}`}
                  type="checkbox"
                  checked={ours.has(name)}
                  disabled={!ours.has(name) && full}
                  onChange={() => toggle(name)}
                />
                {name}
              </label>
            ))}
          </div>
        )}
        {full ? (
          <p className="sm-dlg-hint">Høgst seks frå Vardahei. Ta bort ein for å velje ein annan.</p>
        ) : other === null ? (
          <button type="button" className="linkbtn sm-nytt-notat" onClick={() => setOther('')}>
            <Icon name="pluss" small />
            Legg til namn
          </button>
        ) : (
          <div className="sm-anna">
            <input
              id={`${uid}-anna`}
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
      <div className="sm-dato">
        <label className="field">
          <span>Dato</span>
          <input
            className="input"
            type="date"
            value={day}
            required
            aria-invalid={!dayOk}
            aria-describedby={dayOk ? undefined : `${uid}-dato`}
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
        {!dayOk && (
          <p className="sm-dlg-feil" id={`${uid}-dato`} role="alert">
            Vel ein dato.
          </p>
        )}
      </div>
    </Dialog>
  );
}
