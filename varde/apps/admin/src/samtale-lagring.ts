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

export interface Conflict {
  key: FieldKey;
  mine: Value;
  theirs: Value;
  by: string | null;
}

const DELAY = 700;
const RETRY = 4000;
const backupKey = (id: string) => `varde:samtale:${id}`;

const fieldOf = (key: FieldKey) => key.slice(key.indexOf(':') + 1);
const questionOf = (key: FieldKey) => key.slice(0, key.indexOf(':'));

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
  | { error: string; locked?: boolean };

export class Lagring {
  private server = new Map<FieldKey, Value>();
  private local = new Map<FieldKey, Value>();
  private timers = new Map<FieldKey, number>();
  private queue: FieldKey[] = [];
  private running = false;
  private retry = 0;
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

  /** The server's values, then what this browser kept from an earlier visit. */
  load(values: Record<FieldKey, Value>, locked: boolean) {
    for (const [k, v] of Object.entries(values)) {
      this.server.set(k, v);
      this.local.set(k, v);
    }
    this.locked = locked;
    this.loaded = true;
    for (const [key, kept] of Object.entries(readBackup(this.id))) {
      const now = this.server.get(key) ?? null;
      if (kept.value === now) continue;
      if (kept.expect === now) {
        this.local.set(key, kept.value);
        this.queue.push(key);
      } else this.conflicts.set(key, { key, mine: kept.value, theirs: now, by: null });
    }
    this.writeBackup();
    this.bump();
    void this.run();
  }

  value(key: FieldKey): Value {
    return this.local.get(key) ?? (key.endsWith(':rating') ? null : '');
  }
  text = (key: FieldKey) => this.value(key) ?? '';
  rating = (question: string) => this.value(`${question}:rating`) as Rating | null;

  set(key: FieldKey, value: Value) {
    if (this.locked || this.value(key) === value) return;
    this.local.set(key, value);
    this.writeBackup();
    window.clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      window.setTimeout(() => this.enqueue(key), key.endsWith(':rating') ? 0 : DELAY),
    );
    if (this.state.kind === 'saved') this.state = { kind: 'saving' };
    this.bump();
  }

  /** Changes not on the server yet. */
  waiting(): number {
    let n = 0;
    for (const [k, v] of this.local) if (v !== (this.server.get(k) ?? null)) n += 1;
    return n;
  }

  /** Sends every change now (before «Fullfør», or when the network is back). */
  async flush() {
    for (const [key, t] of this.timers) {
      window.clearTimeout(t);
      this.timers.delete(key);
      this.enqueue(key, false);
    }
    for (const [k, v] of this.local) if (v !== (this.server.get(k) ?? null)) this.enqueue(k, false);
    await this.run();
    return this.waiting() === 0 && this.conflicts.size === 0;
  }

  /** A field another screen changed: keep mine (sent again over theirs) or take theirs. */
  resolve(key: FieldKey, keep: 'mine' | 'theirs') {
    const c = this.conflicts.get(key);
    if (!c) return;
    this.conflicts.delete(key);
    this.server.set(key, c.theirs);
    this.local.set(key, keep === 'mine' ? c.mine : c.theirs);
    this.writeBackup();
    this.bump();
    if (keep === 'mine') this.enqueue(key);
  }

  setLocked(locked: boolean) {
    this.locked = locked;
    this.bump();
  }

  private enqueue(key: FieldKey, start = true) {
    this.timers.delete(key);
    if (!this.queue.includes(key)) this.queue.push(key);
    if (start) void this.run();
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    window.clearTimeout(this.retry);
    let failed: string | null = null;
    try {
      while (this.queue.length) {
        const key = this.queue[0]!;
        const value = this.local.get(key) ?? null;
        const expect = this.server.get(key) ?? (key.endsWith(':rating') ? null : '');
        if (value === expect || this.conflicts.has(key)) {
          this.queue.shift();
          continue;
        }
        this.state = { kind: 'saving' };
        this.bump();
        const sent = await this.send(key, value, expect);
        if ('ok' in sent) {
          this.server.set(key, value);
          // Typed on while this was on its way: the newer text goes next, against what was just saved.
          if ((this.local.get(key) ?? null) === value) this.queue.shift();
          this.writeBackup();
        } else if ('conflict' in sent) {
          const mine = this.local.get(key) ?? null;
          this.conflicts.set(key, { key, mine, theirs: sent.current, by: sent.by });
          this.queue.shift();
          this.writeBackup();
        } else if ('offline' in sent) {
          this.state = { kind: 'offline' };
          this.retry = window.setTimeout(() => void this.run(), RETRY);
          return;
        } else if ('auth' in sent) {
          this.state = { kind: 'auth' };
          return;
        } else if (sent.locked) {
          // Finished on another screen, or not started: nothing more goes through until it opens.
          this.locked = true;
          this.state = { kind: 'error', message: sent.error };
          return;
        } else {
          // This field was refused (too long, a sign that cannot be used); the others still go.
          failed = sent.error;
          this.queue.shift();
        }
      }
      this.state = failed ? { kind: 'error', message: failed } : { kind: 'saved', at: new Date() };
    } finally {
      this.running = false;
      this.bump();
    }
  }

  private async send(key: FieldKey, value: Value, expect: Value): Promise<Sent> {
    const meta = key.startsWith(':');
    const url = meta
      ? `/api/admin/interviews/${this.id}/fields`
      : `/api/admin/interviews/${this.id}/answers/${encodeURIComponent(questionOf(key))}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: fieldOf(key), value, expect }),
      });
    } catch {
      return { offline: true };
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
    if (response.status >= 500 || response.status === 0) return { offline: true };
    return { error: message };
  }

  private writeBackup() {
    const kept: Record<FieldKey, { value: Value; expect: Value }> = {};
    for (const [k, v] of this.local) {
      const s = this.server.get(k) ?? null;
      if (v !== s) kept[k] = { value: v, expect: s };
    }
    for (const c of this.conflicts.values()) kept[c.key] = { value: c.mine, expect: null };
    try {
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

function readBackup(id: string): Record<FieldKey, { value: Value; expect: Value }> {
  try {
    const raw = localStorage.getItem(backupKey(id));
    if (!raw) return {};
    return (
      (JSON.parse(raw) as { kept?: Record<FieldKey, { value: Value; expect: Value }> }).kept ?? {}
    );
  } catch {
    return {};
  }
}

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
