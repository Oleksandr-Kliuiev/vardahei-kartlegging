// Live dashboard cells follow release's k and complementary suppression. Hidden cells
// carry no numeric fields, including when projected from released snapshots. In all_clients the
// two partitions are also checked together (privacy/cross.ts) on the client × role structure.
import { suppressedGroups } from './aggregate.js';
import { hideJointRoles, structures } from './cross.js';
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

/** `cross`: per-client cells of all_clients (`all`, `role:<id>`), never shown themselves. */
export function liveCells(
  cells: readonly ComputedCell[],
  k: number,
  cross?: readonly ComputedCell[],
): ViewCell[] {
  const shapes = cross === undefined ? undefined : structures(cross);
  const joint = new Map<string, string[]>();
  const blocks = new Map<string, ComputedCell[]>();
  for (const c of cells) {
    const key = `${c.metric_key}@${c.metric_version}`;
    blocks.set(key, [...(blocks.get(key) ?? []), c]);
  }
  return [...blocks.entries()].flatMap(([key, block]) => {
    const total = block.find((c) => c.group === 'all');
    const hidden = new Set(block.filter((c) => c.n < k).map((c) => c.group));
    if (total) {
      for (const prefix of ['role:', 'client:']) {
        const parts = block.filter((c) => c.group.startsWith(prefix));
        for (const g of suppressedGroups(total, parts, k)) hidden.add(g);
      }
      // Sub-metrics of one definition mostly share n and structure: one search for them all.
      const parts = block.filter((c) => c !== total);
      const structure = shapes?.get(key);
      const memo = [
        structure === undefined
          ? '-'
          : [...structure].map(([c, rs]) => `${c}:${[...rs].join(',')}`).join(';'),
        ...block.map((c) => `${c.group}=${c.n}${hidden.has(c.group) ? 'x' : ''}`),
      ].join('|');
      const known = joint.get(memo);
      if (known) for (const g of known) hidden.add(g);
      else {
        const before = new Set(hidden);
        hideJointRoles(total, parts, hidden, structure, k);
        joint.set(
          memo,
          [...hidden].filter((g) => !before.has(g)),
        );
      }
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
