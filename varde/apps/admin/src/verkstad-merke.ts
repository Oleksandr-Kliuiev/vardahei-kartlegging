// «Rettskriving» for changed frozen questions (2.15): a choice holds for the wording it was chosen for,
// so a later edit asks again. It is kept in this browser until the version is published; «Ny meining»
// lives in the draft itself as a new anchor.
import { useEffect, useMemo, useState } from 'react';
import type { Question } from '../../../packages/schema/src/template/question.js';
import { withoutAnchor, type FrozenChange } from './verkstad-model.js';

const MARKS = (id: string) => `varde:merke:${id}`;
function readMarks(id: string): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(MARKS(id)) ?? '{}') as unknown;
    return raw && typeof raw === 'object' ? (raw as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function useSpelling(versionId: string, frozen: readonly FrozenChange[]) {
  const [marks, setMarks] = useState(() => readMarks(versionId));
  useEffect(() => {
    try {
      localStorage.setItem(MARKS(versionId), JSON.stringify(marks));
    } catch {
      /* The choice still holds for this visit. */
    }
  }, [marks]);
  /** The changes marked «Rettskriving» for their present wording. */
  const spelling = useMemo(
    () =>
      Object.fromEntries(
        frozen
          .filter((f) => !f.semantic && marks[f.id] === withoutAnchor(f.now))
          .map((f) => [f.id, 'orthographic' as const]),
      ),
    [frozen, marks],
  );
  return {
    marks,
    spelling,
    /** «Rettskriving» for `now` (the question as it reads), or no mark for «Ny meining». */
    mark: (id: string, kind: 'orthographic' | 'semantic', now: Question | undefined) =>
      setMarks((m) => {
        const next = { ...m };
        if (kind === 'orthographic' && now) next[id] = withoutAnchor(now);
        else delete next[id];
        return next;
      }),
    forget: () => {
      try {
        localStorage.removeItem(MARKS(versionId));
      } catch {
        /* Nothing kept. */
      }
    },
  };
}
