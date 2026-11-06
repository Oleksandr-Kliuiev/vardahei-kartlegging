// Saving a conversation (2.20): every field goes to the server on its own, a short pause after the last
// key, one request at a time, naming the value it replaces (409 when another screen changed it). Until
// the server has a change, it is kept in this browser with the value it was written on, so a lost
// connection, a closed lid or a session that ran out never loses what was typed: it is sent when the
// network is back, or offered again when the conversation is opened next time.
import { useMemo, useSyncExternalStore } from 'react';
import type { Interview, Rating } from './samtale-models.js';

/** `N12:answer`, `N12:rating`, `N12:action`, `N12:note`; the whole conversation: `:summary`, `:agreed`, `:note`. */
export type FieldKey = string;
type Value = string | null;

export type SaveState =
  | { kind: 'saved'; at: Date | null }
  | { kind: 'saving' }
  /** No network: the changes wait in this browser and go out when it is back. */
  | { kind: 'offline' }
  /** The session ran out: the changes wait here until the person has signed in again. */
  | { kind: 'auth' }
  | { kind: 'error'; message: string };

/** A field another screen changed. What is on this screen stays this screen's text (it can still be
 * typed in); `base` is the value that text was written on, kept with the copy so a reload asks again
 * instead of choosing for the person. */
export interface Conflict {
  key: FieldKey;
  theirs: Value;
  by: string | null;
  base: Value;
}

/** One change kept in the browser: the text, the server value it was written on and what was sent of it
 * without an answer (on its way, the network gone, signed out): a reload that finds one of those on the
 * server knows it as its own. */
interface Kept {
  value: Value;
  expect: Value;
  sent?: Value[];
}

const DELAY = 700;
const RETRY = 4000;
/** A request with no answer after this long counts as lost (a half-open connection, a captive portal). */
const TIMEOUT = 15_000;
/** How many unanswered values of one field are remembered. */
const MAYBE = 10;
const SERVER_FAILED = 'Tenaren tok ikkje imot alle endringane. Varde prøver igjen.';
const backupKey = (id: string) => `varde:samtale:${id}`;

const fieldOf = (key: FieldKey) => key.slice(key.indexOf(':') + 1);
const questionOf = (key: FieldKey) => key.slice(0, key.indexOf(':'));
const empty = (key: FieldKey): Value => (key.endsWith(':rating') ? null : '');

/** What cannot be stored goes as it is typed or pasted (a PDF's form feed, a Word line break, half of a
 * character), instead of a refusal later: line breaks and tabs stay. */
export function clean(v: Value): Value {
  if (typeof v !== 'string') return v;
  return v
    .replace(/\r\n?/g, '\n')
    .replace(/[\v\f]/g, '\n')
    .replace(/[^\P{Cc}\n\t]/gu, '')
    .replace(/\p{Cs}/gu, '�');
}

/** Every field of a conversation as the server has it. */
export function serverValues(i: Interview): Record<FieldKey, Value> {
  const out: Record<FieldKey, Value> = {
    ':summary': i.summary,
    ':agreed': i.agreed,
    ':note': i.note,
  };
  for (const q of i.guide.questions) {
    const a = i.answers[q.id];
    out[`${q.id}:answer`] = a?.answer ?? '';
    out[`${q.id}:rating`] = a?.rating ?? null;
    out[`${q.id}:action`] = a?.action ?? '';
    out[`${q.id}:note`] = a?.note ?? '';
  }
  return out;
}

type Sent =
  | { ok: true }
  | { conflict: true; current: Value; by: string | null; message: string }
  | { offline: true }
  | { auth: true }
  /** `server`: the server failed (5xx, 429), try again later; `locked`: finished or not started. */
  | { error: string; locked?: boolean; server?: boolean };

export class Lagring {
  private server = new Map<FieldKey, Value>();
  private local = new Map<FieldKey, Value>();
  private timers = new Map<FieldKey, number>();
  private queue: FieldKey[] = [];
  private running: Promise<void> | null = null;
  private retry = 0;
  /** The save on its way; kept in the copy (see `Kept.sent`). */
  private inflight: { key: FieldKey; value: Value } | null = null;
  /** Values sent without an answer since the last confirmed one (the network went, signed out): any of
   * them may be on the server (another tab sends the copy after signing in), so finding one there is no
   * conflict. */
  private maybe = new Map<FieldKey, Value[]>();
  /** Fields the server failed on: tried again after a pause while the others go on. */
  private failing = new Set<FieldKey>();
  private failTimer = 0;
  /** Fields the server refused (too long, a sign it cannot store), with its words: tried again when the
   * field is changed or at «Fullfør», and named on the save line until then. */
  refused = new Map<FieldKey, string>();
  /** What this tab last wrote to the copy, per field: it removes only its own entries, so another tab of
   * the same browser keeps its changes. */
  private written = new Map<FieldKey, string>();
  private listeners = new Set<() => void>();
  loaded = false;
  /** A finished conversation takes no changes until it is opened again. */
  locked = false;
  version = 0;
  state: SaveState = { kind: 'saved', at: null };
  conflicts = new Map<FieldKey, Conflict>();

  constructor(readonly id: string) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private bump() {
    this.version += 1;
    for (const fn of this.listeners) fn();
  }

  /** The server's values, then what this browser kept from an earlier visit (on screen again). */
  load(values: Record<FieldKey, Value>, locked: boolean) {
    for (const [k, v] of Object.entries(values)) {
      this.server.set(k, v);
      this.local.set(k, v);
    }
    this.locked = locked;
    this.loaded = true;
    for (const [key, kept] of Object.entries(readBackup(this.id))) {
      if (!this.server.has(key)) continue;
      this.written.set(key, JSON.stringify(kept));
      const now = this.server.get(key) ?? null;
      if (kept.value === now) continue;
      this.local.set(key, kept.value);
      const sent = Array.isArray(kept.sent) ? kept.sent : [];
      if (kept.expect === now || sent.includes(now)) {
        if (sent.length) this.maybe.set(key, [...sent]);
        this.queue.push(key);
      } else this.conflicts.set(key, { key, theirs: now, by: null, base: kept.expect });
    }
    this.writeBackup();
    this.bump();
    void this.run();
  }

  value(key: FieldKey): Value {
    return this.local.get(key) ?? empty(key);
  }
  text = (key: FieldKey) => this.value(key) ?? '';
  rating = (question: string) => this.value(`${question}:rating`) as Rating | null;

  set(key: FieldKey, raw: Value) {
    const value = clean(raw);
    if (this.locked || this.value(key) === value) return;
    this.local.set(key, value);
    this.refused.delete(key);
    this.writeBackup();
    window.clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      window.setTimeout(() => this.enqueue(key), key.endsWith(':rating') ? 0 : DELAY),
    );
    if (this.state.kind === 'saved') this.state = { kind: 'saving' };
    this.bump();
  }

  /** Changes not on the server yet (a field in conflict counts until it is chosen). */
  waiting(): number {
    let n = 0;
    for (const [k, v] of this.local)
      if (v !== (this.server.get(k) ?? null) || this.maybe.has(k)) n += 1;
    return n;
  }

  /** Sends every change now and waits for it (before «Fullfør», or when the network is back): true when
   * the server has everything and nothing waits for a choice. */
  async flush() {
    for (const [key, t] of this.timers) {
      window.clearTimeout(t);
      this.timers.delete(key);
      this.enqueue(key, false);
    }
    for (const [k, v] of this.local)
      if (v !== (this.server.get(k) ?? null) || this.maybe.has(k)) this.enqueue(k, false);
    this.failing.clear();
    this.refused.clear();
    while (this.running) await this.running;
    await this.run();
    return this.waiting() === 0 && this.conflicts.size === 0;
  }

  /** A field another screen changed: keep what is on this screen (sent over theirs) or take theirs. */
  resolve(key: FieldKey, keep: 'mine' | 'theirs') {
    const c = this.conflicts.get(key);
    if (!c) return;
    this.conflicts.delete(key);
    this.server.set(key, c.theirs);
    if (keep === 'theirs') this.local.set(key, c.theirs);
    this.writeBackup();
    this.bump();
    if (keep === 'mine') this.enqueue(key);
  }

  /** Locked by «Fullfør»; opened again by «Opne for endring», which sends what waited. */
  setLocked(locked: boolean) {
    this.locked = locked;
    if (!locked) {
      if (this.state.kind === 'error') this.state = { kind: 'saved', at: null };
      void this.flush();
    }
    this.bump();
  }

  private enqueue(key: FieldKey, start = true) {
    this.timers.delete(key);
    if (!this.queue.includes(key)) this.queue.push(key);
    if (start) void this.run();
  }

  private run(): Promise<void> {
    this.running ??= this.drain().finally(() => {
      this.running = null;
      this.bump();
    });
    return this.running;
  }

  private async drain(): Promise<void> {
    window.clearTimeout(this.retry);
    let failed: string | null = null;
    while (this.queue.length) {
      const key = this.queue[0]!;
      const value = this.local.get(key) ?? null;
      const expect = this.server.get(key) ?? empty(key);
      // A value that may have reached the server is sent again even when it looks saved: the answer says.
      const settled = value === expect && !this.maybe.has(key);
      const waits = this.conflicts.has(key) || this.failing.has(key) || this.refused.has(key);
      if (settled || waits) {
        this.queue.shift();
        continue;
      }
      this.state = { kind: 'saving' };
      this.inflight = { key, value };
      this.writeBackup();
      this.bump();
      const sent = await this.send(key, value, expect);
      this.inflight = null;
      if ('ok' in sent) {
        this.maybe.delete(key);
        this.server.set(key, value);
        // Typed on while this was on its way: the newer text goes next, against what was just saved.
        if ((this.local.get(key) ?? null) === value) this.queue.shift();
      } else if ('conflict' in sent) {
        const ours = sent.current === value || (this.maybe.get(key) ?? []).includes(sent.current);
        this.maybe.delete(key);
        if (ours || sent.current === (this.local.get(key) ?? null)) {
          // The server has what this screen sent (its answer was lost on the way) or what it shows now:
          // that is the new base, and newer typing goes on top of it.
          this.server.set(key, sent.current);
          if ((this.local.get(key) ?? null) === sent.current) this.queue.shift();
        } else {
          this.conflicts.set(key, { key, theirs: sent.current, by: sent.by, base: expect });
          this.queue.shift();
        }
      } else if ('offline' in sent) {
        this.remember(key, value);
        this.state = { kind: 'offline' };
        this.retry = window.setTimeout(() => void this.run(), RETRY);
        this.writeBackup();
        return;
      } else if ('auth' in sent) {
        // Not saved, but kept in the copy: another tab may send it after signing in.
        this.remember(key, value);
        this.state = { kind: 'auth' };
        this.writeBackup();
        return;
      } else if (sent.locked) {
        // Finished on another screen, or not started: nothing more goes through until it opens.
        this.locked = true;
        this.state = { kind: 'error', message: sent.error };
        this.writeBackup();
        return;
      } else {
        // This field failed (refused, or the server failed on it); the others still go.
        if (sent.server) this.failing.add(key);
        else this.refused.set(key, sent.error);
        failed = sent.server ? SERVER_FAILED : sent.error;
        this.queue.shift();
      }
      this.writeBackup();
    }
    if (this.failing.size && !this.failTimer)
      this.failTimer = window.setTimeout(() => {
        this.failTimer = 0;
        const again = [...this.failing];
        this.failing.clear();
        for (const k of again) this.enqueue(k, false);
        void this.run();
      }, RETRY);
    failed ??= this.failing.size ? SERVER_FAILED : (this.refused.values().next().value ?? null);
    this.state = failed ? { kind: 'error', message: failed } : { kind: 'saved', at: new Date() };
  }

  private remember(key: FieldKey, value: Value) {
    const sent = (this.maybe.get(key) ?? []).filter((v) => v !== value);
    this.maybe.set(key, [...sent, value].slice(-MAYBE));
  }

  private async send(key: FieldKey, value: Value, expect: Value): Promise<Sent> {
    const meta = key.startsWith(':');
    const url = meta
      ? `/api/admin/interviews/${this.id}/fields`
      : `/api/admin/interviews/${this.id}/answers/${encodeURIComponent(questionOf(key))}`;
    let response: Response;
    const stop = new AbortController();
    const timer = window.setTimeout(() => stop.abort(), TIMEOUT);
    try {
      response = await fetch(url, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: fieldOf(key), value, expect }),
        signal: stop.signal,
      });
    } catch {
      return { offline: true };
    } finally {
      window.clearTimeout(timer);
    }
    if (response.ok) return { ok: true };
    if (response.status === 401) return { auth: true };
    const body = (await response.json().catch(() => null)) as {
      message?: unknown;
      current?: Value;
      updated_by?: string | null;
    } | null;
    const message =
      typeof body?.message === 'string' ? body.message : 'Noko gjekk gale. Prøv igjen.';
    if (response.status === 409 && body && 'current' in body)
      return {
        conflict: true,
        current: body.current ?? null,
        by: body.updated_by ?? null,
        message,
      };
    if (response.status === 409) return { error: message, locked: true };
    if (response.status >= 500 || response.status === 429 || response.status === 0)
      return { error: message, server: true };
    return { error: message };
  }

  private entry(key: FieldKey): Kept | null {
    const v = this.local.get(key) ?? null;
    const c = this.conflicts.get(key);
    if (c) return { value: v, expect: c.base };
    const s = this.server.get(key) ?? null;
    const sent = [...(this.maybe.get(key) ?? [])];
    if (this.inflight?.key === key && !sent.includes(this.inflight.value))
      sent.push(this.inflight.value);
    if (sent.length) return { value: v, expect: s, sent };
    return v === s ? null : { value: v, expect: s };
  }

  private writeBackup() {
    try {
      const kept = readBackup(this.id);
      for (const key of this.local.keys()) {
        const entry = this.entry(key);
        const mine = this.written.get(key);
        if (entry) {
          kept[key] = entry;
          this.written.set(key, JSON.stringify(entry));
        } else if (mine !== undefined) {
          if (kept[key] && JSON.stringify(kept[key]) === mine) delete kept[key];
          this.written.delete(key);
        }
      }
      if (Object.keys(kept).length)
        localStorage.setItem(
          backupKey(this.id),
          JSON.stringify({ at: new Date().toISOString(), kept }),
        );
      else localStorage.removeItem(backupKey(this.id));
    } catch {
      /* Storage may be full or off; the text is still on screen and the queue keeps trying. */
    }
  }
}

function readBackup(id: string): Record<FieldKey, Kept> {
  try {
    const raw = localStorage.getItem(backupKey(id));
    if (!raw) return {};
    return (JSON.parse(raw) as { kept?: Record<FieldKey, Kept> }).kept ?? {};
  } catch {
    return {};
  }
}

/** Where a field is on screen: its question, or the summary for the fields of the whole conversation. */
export const placeOf = (id: string, key: FieldKey) =>
  key.startsWith(':')
    ? `/admin/samtalar/${id}/oppsummering`
    : `/admin/samtalar/${id}?q=${encodeURIComponent(questionOf(key))}`;

// One store per conversation for the whole visit: the questions and the summary share it, and a save
// still on its way when the page changes is not lost.
const stores = new Map<string, Lagring>();
export const storeOf = (id: string) => {
  let s = stores.get(id);
  if (!s) stores.set(id, (s = new Lagring(id)));
  return s;
};
if (typeof window !== 'undefined')
  window.addEventListener('online', () => {
    for (const s of stores.values()) void s.flush();
  });

/** The store of a loaded conversation, re-rendering the caller on every change. */
export function useLagring(interview: Interview | undefined): Lagring | null {
  // Loaded while rendering (once per visit, idempotent), so the fields never paint empty first.
  const store = useMemo(() => {
    if (!interview) return null;
    const s = storeOf(interview.id);
    if (!s.loaded) s.load(serverValues(interview), interview.status === 'done');
    return s;
  }, [interview]);
  useSyncExternalStore(store?.subscribe ?? noop, () => store?.version ?? 0);
  return store;
}
const noop = () => () => undefined;
