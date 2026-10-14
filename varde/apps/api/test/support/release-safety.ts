import { expect } from 'vitest';

interface Cell {
  population?: string;
  client?: string | null | undefined;
  metric_key: string;
  metric_version?: number;
  group: string;
  n: number;
  numerator: number;
  suppressed?: boolean;
}

const blockKey = (c: Cell) =>
  `${c.population ?? ''}|${c.client ?? ''}|${c.metric_key}@${c.metric_version ?? 1}`;
const unitKey = (c: Cell) => `${blockKey(c)}|${c.group}`;

/** Independently inspect what a reader can subtract, including suppressed cells in the
 * remainder. Delta cells exist only when both published operands are visible. */
export function assertReleaseSafety(now: readonly Cell[], before?: readonly Cell[], k = 3): number {
  const earlier = new Map(before?.map((c) => [unitKey(c), c]));
  const blocks = new Map<string, Cell[]>();
  for (const c of now) blocks.set(blockKey(c), [...(blocks.get(blockKey(c)) ?? []), c]);
  let checked = 0;
  for (const [key, cells] of blocks) {
    // ADR-021 rule 6 exempts the exact round_client counter and its subtraction relation.
    if (cells[0]?.population === 'round_client' && cells[0].metric_key === 'responses_total')
      continue;
    const visible = cells.filter(
      (c) => !c.suppressed && (!before || earlier.get(unitKey(c))?.suppressed === false),
    );
    const delta = (c: Cell) => c.n - (before ? earlier.get(unitKey(c))!.n : 0);
    for (const c of visible) {
      const n = delta(c);
      expect(before ? n === 0 || Math.abs(n) >= k : n >= k, `${key}/${c.group}: ${n}`).toBe(true);
      checked += 1;
    }
    const total = visible.find((c) => c.group === 'all');
    if (!total) continue;
    const prefixes = new Set(
      cells.filter((c) => c.group !== 'all').map((c) => c.group.split(':')[0]),
    );
    for (const prefix of prefixes) {
      const remainder =
        delta(total) -
        visible
          .filter((c) => c.group.startsWith(`${prefix}:`))
          .reduce((sum, c) => sum + delta(c), 0);
      expect(
        before ? remainder === 0 || Math.abs(remainder) >= k : remainder === 0 || remainder >= k,
        `${key}/${prefix}/${before ? 'diff' : 'release'}: ${remainder}`,
      ).toBe(true);
      checked += 1;
    }
  }
  return checked;
}

/** First release: every hidden cell must be justified, so hiding an entire partition cannot
 * make parity/completeness pass vacuously. Restoring a complementary cell must expose < k. */
export function assertSuppressionJustified(
  now: readonly Cell[],
  raw: readonly Cell[],
  k = 3,
): void {
  const offered = new Map(raw.map((c) => [unitKey(c), c]));
  for (const c of now.filter((c) => c.suppressed)) {
    const source = offered.get(unitKey(c));
    expect(source, unitKey(c)).toBeDefined();
    if (source!.n < k) continue;
    const block = now.filter((x) => blockKey(x) === blockKey(c));
    const total = block.find((x) => x.group === 'all');
    expect(total, unitKey(c)).toBeDefined();
    const rawTotal = offered.get(unitKey(total!))!;
    if (rawTotal.n < k) continue;
    expect(total!.suppressed, unitKey(c)).toBe(false);
    const prefix = c.group.split(':')[0];
    const restored =
      rawTotal.n -
      source!.n -
      block
        .filter((x) => !x.suppressed && x.group.startsWith(`${prefix}:`))
        .reduce((n, x) => n + x.n, 0);
    expect(restored > 0 && restored < k, `unjustified suppression ${unitKey(c)}: ${restored}`).toBe(
      true,
    );
  }
}
