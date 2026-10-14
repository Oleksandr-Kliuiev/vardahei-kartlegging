// Live dashboard cells follow release's k and complementary suppression. Hidden cells
// carry no numeric fields, including when projected from released snapshots.
import { suppressedGroups } from './aggregate.js';
import type { ComputedCell } from './release.js';

export type ViewCell = { metric_key: string; metric_version: number; group: string } & (
  | { suppressed: true }
  | {
      suppressed: false;
      n: number;
      numerator: number;
      denominator: number;
      missing: number;
      stale?: boolean;
      release_id?: string;
    }
);

export function liveCells(cells: readonly ComputedCell[], k: number): ViewCell[] {
  const blocks = new Map<string, ComputedCell[]>();
  for (const c of cells) {
    const key = `${c.metric_key}@${c.metric_version}`;
    blocks.set(key, [...(blocks.get(key) ?? []), c]);
  }
  return [...blocks.values()].flatMap((block) => {
    const total = block.find((c) => c.group === 'all');
    const hidden = new Set(block.filter((c) => c.n < k).map((c) => c.group));
    if (total)
      for (const prefix of ['role:', 'client:']) {
        const parts = block.filter((c) => c.group.startsWith(prefix));
        for (const g of suppressedGroups(total, parts, k)) hidden.add(g);
      }
    return block.map((c): ViewCell => {
      const base = { metric_key: c.metric_key, metric_version: c.metric_version, group: c.group };
      return hidden.has(c.group)
        ? { ...base, suppressed: true }
        : {
            ...base,
            suppressed: false,
            n: c.n,
            numerator: c.numerator,
            denominator: c.denominator,
            missing: c.missing,
          };
    });
  });
}
