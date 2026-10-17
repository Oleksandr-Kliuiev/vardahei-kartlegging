// «Hald fram» (2.17): the last place in the workshop, kept in this browser only, so «I dag» opens the
// survey again on the question where the work stopped.
import { useEffect } from 'react';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import { NODE } from './verkstad-model.js';

const KEY = 'varde:hald-fram';
export interface Spor {
  /** The template version open in the workshop. */
  id: string;
  title: string;
  /** The selected trail node: a question id or a part of the survey. */
  node: string;
  at: string;
}

export function lastPlace(): Spor | null {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Partial<Spor>) : null;
    return s && typeof s.id === 'string' && typeof s.node === 'string' && typeof s.at === 'string'
      ? { id: s.id, title: String(s.title ?? ''), node: s.node, at: s.at }
      : null;
  } catch {
    return null;
  }
}

/** Where to start in this version: the node left last time, if it is still there. */
export function lastNode(id: string, c: TemplateContent): string | null {
  const s = lastPlace();
  if (s?.id !== id) return null;
  const parts: string[] = Object.values(NODE);
  return parts.includes(s.node) || c.questions.some((q) => q.id === s.node) ? s.node : null;
}

/** Keeps the selected node of the open version as the place to come back to. */
export function useHaldFram(id: string, title: string, node: string) {
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ id, title, node, at: new Date().toISOString() }));
    } catch {
      /* Private windows and full storage: «Hald fram» just stays empty. */
    }
  }, [id, title, node]);
}

const PART: Record<string, string> = {
  [NODE.settings]: 'innstillingane',
  [NODE.intro]: 'velkomsten',
  [NODE.invitation]: 'invitasjonen',
  [NODE.leader]: 'leiardelen',
  [NODE.end]: 'avslutninga',
};
/** «F5», «velkomsten», «ein seksjon». */
export const placeName = (node: string) =>
  PART[node] ?? (node.startsWith(':') ? 'ein seksjon' : node);

/** «for 4 minutt sidan», «for 2 timar sidan», «i går», «for 5 dagar sidan». */
export function sidan(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'no nettopp';
  if (min < 60) return `for ${min} minutt sidan`;
  const h = Math.round(min / 60);
  if (h < 24) return `for ${h} ${h === 1 ? 'time' : 'timar'} sidan`;
  const d = Math.round(h / 24);
  return d === 1 ? 'i går' : `for ${d} dagar sidan`;
}
