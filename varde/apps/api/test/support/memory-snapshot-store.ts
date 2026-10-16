// In-memory SnapshotStore of the release tests (0.15b); the Prisma store is 1.4c
// (modules/privacy/prisma-snapshot-store.ts). History = every saved batch; metric set per round.
import type { Population } from '@varde/schema/metrics/populations';
import type {
  ReleasedSnapshot,
  SupersededSnapshot,
} from '@varde/schema/metrics/aggregate-snapshot';
import type { HistoricCell, SnapshotStore } from '../../src/modules/privacy/privacy.service.js';

type Stored = ReleasedSnapshot | SupersededSnapshot;

export class MemorySnapshotStore implements SnapshotStore {
  /** Every snapshot ever saved, in order; superseded ones are replaced in place, never removed. */
  readonly all: Stored[] = [];
  /** Every release batch as saved (round, population, cells). */
  readonly batches: { round: string; population: Population; cells: HistoricCell[] }[] = [];
  readonly metricSets = new Map<string, readonly string[]>();
  writes = 0;

  listHistory(round: string, population: Population): Promise<HistoricCell[][]> {
    return Promise.resolve(
      this.batches.filter((b) => b.round === round && b.population === population).map((b) => b.cells),
    );
  }

  metricSet(round: string): Promise<readonly string[] | null> {
    return Promise.resolve(this.metricSets.get(round) ?? null);
  }

  fixMetricSet(round: string, metrics: readonly string[]): Promise<void> {
    this.metricSets.set(round, [...metrics]);
    return Promise.resolve();
  }

  listReleased(round: string, population: Population): Promise<ReleasedSnapshot[]> {
    return Promise.resolve(
      this.all.filter(
        (s): s is ReleasedSnapshot =>
          s.status === 'released' && s.round === round && s.population === population,
      ),
    );
  }

  save(snapshots: readonly ReleasedSnapshot[]): Promise<void> {
    this.writes += 1;
    this.all.push(...snapshots);
    const first = snapshots[0];
    if (first !== undefined) {
      this.batches.push({ round: first.round, population: first.population, cells: snapshots.map((x) => ({ ...x })) });
    }
    return Promise.resolve();
  }

  supersede(snapshots: readonly SupersededSnapshot[]): Promise<void> {
    this.writes += 1;
    for (const next of snapshots) {
      const i = this.all.findIndex(
        (s) =>
          s.status === 'released' &&
          s.round === next.round &&
          s.population === next.population &&
          s.client === next.client &&
          s.metric_key === next.metric_key &&
          s.metric_version === next.metric_version &&
          s.group === next.group,
      );
      if (i < 0) throw new Error('supersede of an unknown snapshot');
      this.all[i] = next;
    }
    return Promise.resolve();
  }
}

/** The same store with the equivalence of PrismaSnapshotStore (1.32): `round_client` X `all` ↔
 * `all_clients` `client:X`, for tests that release both populations of a round in order. */
export class LinkedMemorySnapshotStore extends MemorySnapshotStore {
  private static mapped<T extends { client?: string | undefined; group: string }>(
    population: Population,
    cell: T,
  ): T | undefined {
    if (population === 'all_clients' && cell.client && cell.group === 'all') {
      const out = { ...cell, group: `client:${cell.client}` };
      delete out.client;
      return out;
    }
    if (population === 'round_client' && cell.group.startsWith('client:'))
      return { ...cell, client: cell.group.slice(7), group: 'all' };
    return undefined;
  }

  private static other(population: Population): Population | undefined {
    if (population === 'leaders_all') return undefined;
    return population === 'all_clients' ? 'round_client' : 'all_clients';
  }

  async listLinkedReleased(round: string, population: Population): Promise<ReleasedSnapshot[]> {
    const other = LinkedMemorySnapshotStore.other(population);
    if (!other) return [];
    return (await this.listReleased(round, other)).flatMap((s) => {
      const m = LinkedMemorySnapshotStore.mapped(population, s);
      return m ? [{ ...m, population }] : [];
    });
  }

  async listLinkedHistory(round: string, population: Population): Promise<HistoricCell[][]> {
    const other = LinkedMemorySnapshotStore.other(population);
    if (!other) return [];
    return (await this.listHistory(round, other)).map((cells) =>
      cells.flatMap((c) => {
        const m = LinkedMemorySnapshotStore.mapped(population, c);
        return m ? [m] : [];
      }),
    );
  }
}
