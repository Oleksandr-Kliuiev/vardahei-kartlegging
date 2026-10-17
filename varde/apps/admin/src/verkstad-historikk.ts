// Undo and redo for the workshop (2.15): every change is a step; typing in one field within a moment
// is one step, so ⌘Z takes back a word or a sentence, not a single letter.
import { useCallback, useState } from 'react';

const MERGE_MS = 1200;
const LIMIT = 100;

interface History<T> {
  present: T;
  past: T[];
  future: T[];
  key: string;
  at: number;
}

export function useHistory<T>(initial: T) {
  const [h, setH] = useState<History<T>>({
    present: initial,
    past: [],
    future: [],
    key: '',
    at: 0,
  });
  /** `key` names the field being typed in; changes with the same key close together merge. */
  const change = useCallback((fn: (present: T) => T, key = '') => {
    setH((s) => {
      const next = fn(s.present);
      if (next === s.present) return s;
      const now = Date.now();
      const merge = key !== '' && key === s.key && now - s.at < MERGE_MS;
      return {
        present: next,
        past: merge ? s.past : [...s.past, s.present].slice(-LIMIT),
        future: [],
        key,
        at: now,
      };
    });
  }, []);
  const undo = useCallback(() => {
    setH((s) =>
      s.past.length
        ? {
            present: s.past[s.past.length - 1]!,
            past: s.past.slice(0, -1),
            future: [s.present, ...s.future],
            key: '',
            at: 0,
          }
        : s,
    );
  }, []);
  const redo = useCallback(() => {
    setH((s) =>
      s.future.length
        ? {
            present: s.future[0]!,
            past: [...s.past, s.present],
            future: s.future.slice(1),
            key: '',
            at: 0,
          }
        : s,
    );
  }, []);
  /** A new starting point (loaded from the server): no undo across it. */
  const reset = useCallback(
    (value: T) => setH({ present: value, past: [], future: [], key: '', at: 0 }),
    [],
  );
  return {
    present: h.present,
    change,
    undo,
    redo,
    reset,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
  };
}
