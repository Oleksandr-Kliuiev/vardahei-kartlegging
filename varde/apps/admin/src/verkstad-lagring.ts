// Autosave of a workshop draft (2.15, decision 17.10): every change is saved after a short pause with the
// hash it was loaded with, so another tab's save is never overwritten silently (409). Saves run one at a
// time. Nothing typed is lost: while a save fails, or when the workshop is left before the pause is over,
// the draft is kept in this browser with its hash and offered back on the next visit.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import { ApiError, api, mutate } from './api.js';
import type { EditorVersion } from './survey-models.js';
import { canonical } from './verkstad-model.js';

export type SaveState =
  | { kind: 'saved'; at: Date | null }
  | { kind: 'waiting' }
  | { kind: 'saving' }
  /** The server turned the draft down (a broken reference or an empty required field). */
  | { kind: 'blocked'; message: string }
  /** Someone else saved this draft since it was loaded. */
  | { kind: 'conflict'; message: string }
  | { kind: 'error'; message: string };

const backupKey = (id: string) => `varde:verkstad:${id}`;
/** Unsaved work kept in this browser, with the hash of the version it was written on. */
export interface Backup {
  content: TemplateContent;
  at: string;
  hash?: string;
}
export function readBackup(id: string): Backup | null {
  try {
    const raw = localStorage.getItem(backupKey(id));
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}
export function dropBackup(id: string) {
  try {
    localStorage.removeItem(backupKey(id));
  } catch {
    /* Nothing to drop. */
  }
}
function keepBackup(id: string, content: TemplateContent, hash: string) {
  try {
    const kept: Backup = { content, at: new Date().toISOString(), hash };
    localStorage.setItem(backupKey(id), JSON.stringify(kept));
  } catch {
    /* Storage may be full or off; the draft is still on screen. */
  }
}

// Saves still on their way, by version: opening the version again waits for them, so it never starts
// from what the server had before the last save.
const pending = new Map<string, Promise<unknown>>();
export const savesOf = (id: string) => pending.get(id);

const DELAY = 700;

export function useAutosave(
  saved: EditorVersion,
  content: TemplateContent,
  onSaved: (v: EditorVersion) => void,
  enabled: boolean,
) {
  const [state, setState] = useState<SaveState>({ kind: 'saved', at: null });
  const last = useRef(saved),
    latest = useRef(content),
    busy = useRef<Promise<EditorVersion | null> | null>(null),
    timer = useRef(0),
    retry = useRef(0),
    conflict = useRef(false),
    on = useRef(enabled);
  latest.current = content;
  on.current = enabled;
  useEffect(() => {
    last.current = saved;
  }, [saved]);
  const dirty = () => canonical(latest.current) !== canonical(last.current.content);

  const run = useCallback(async (): Promise<EditorVersion | null> => {
    // One save at a time, with the hash the previous one returned.
    while (busy.current) await busy.current;
    if (!dirty()) {
      if (!conflict.current) {
        dropBackup(last.current.id);
        setState((s) => (s.kind === 'saved' ? s : { kind: 'saved', at: null }));
      }
      return last.current;
    }
    const sending = latest.current,
      base = last.current;
    setState({ kind: 'saving' });
    const work = (async () => {
      try {
        const v = await mutate<EditorVersion>(`/api/admin/surveys/versions/${base.id}`, 'PUT', {
          content_hash: base.content_hash,
          content: sending,
        });
        last.current = v;
        onSaved(v);
        dropBackup(v.id);
        setState(dirty() ? { kind: 'waiting' } : { kind: 'saved', at: new Date() });
        return v;
      } catch (e) {
        keepBackup(base.id, latest.current, base.content_hash);
        const message = e instanceof Error ? e.message : 'Kunne ikkje lagre.';
        if (e instanceof ApiError && e.status === 409) {
          conflict.current = true;
          setState({ kind: 'conflict', message });
        } else if (e instanceof ApiError && e.status === 400)
          setState({ kind: 'blocked', message });
        else {
          setState({ kind: 'error', message });
          clearTimeout(retry.current);
          retry.current = window.setTimeout(() => void run(), 5000);
        }
        return null;
      }
    })();
    busy.current = work;
    pending.set(base.id, work);
    const result = await work;
    if (busy.current === work) busy.current = null;
    if (pending.get(base.id) === work) pending.delete(base.id);
    return result;
  }, [onSaved]);

  useEffect(() => {
    if (!enabled || !dirty()) return;
    setState((s) => (s.kind === 'conflict' ? s : { kind: 'waiting' }));
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!conflict.current) void run();
    }, DELAY);
    return () => clearTimeout(timer.current);
  }, [content, enabled]);
  // Leaving the workshop inside the app (menu, «Skjema», back): what is not saved yet is kept in this
  // browser and saved now, unless another save is in the way.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(retry.current);
      if (!on.current || !dirty()) return;
      keepBackup(last.current.id, latest.current, last.current.content_hash);
      if (!conflict.current) void run();
    },
    [],
  );
  // Leaving the page with unsaved work keeps it in this browser and asks the browser to warn.
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (!enabled || !dirty()) return;
      keepBackup(last.current.id, latest.current, last.current.content_hash);
      e.preventDefault();
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [enabled]);

  /** Saves now (before accepting a language or publishing); null when the save did not go through. */
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    return run();
  }, [run]);
  /** After a conflict: the version as saved elsewhere, to load it or to save over it on purpose. */
  const fetchLatest = useCallback(
    () => api<EditorVersion>(`/api/admin/surveys/versions/${last.current.id}`),
    [],
  );
  const overwrite = useCallback(async () => {
    const fresh = await fetchLatest();
    last.current = fresh;
    conflict.current = false;
    return run();
  }, [fetchLatest, run]);
  /**
   * Work kept in this browser goes back through the hash it was written on: when the draft has been
   * saved elsewhere since, the save meets a 409 and the conflict choice, never a silent overwrite.
   */
  const restore = useCallback((hash: string | undefined) => {
    last.current = { ...last.current, content_hash: hash ?? '0'.repeat(64) };
  }, []);
  /** After loading the other version: start over from it. */
  const resolved = useCallback((v: EditorVersion) => {
    last.current = v;
    conflict.current = false;
    dropBackup(v.id);
    setState({ kind: 'saved', at: null });
  }, []);
  return { state, flush, fetchLatest, overwrite, restore, resolved, dirty };
}
