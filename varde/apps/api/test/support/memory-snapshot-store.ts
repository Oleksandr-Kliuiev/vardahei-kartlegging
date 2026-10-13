// In-memory SnapshotStore of the release tests (0.15b); the Prisma store is 1.4c.
import type { Population } from '@varde/schema/metrics/populations';
import type {
  ReleasedSnapshot,
  SupersededSnapshot,
} from '@varde/schema/metrics/aggregate-snapshot';
import type { SnapshotStore } from '../../src/modules/privacy/privacy.service.js';

type Stored = ReleasedSnapshot | SupersededSnapshot;

export class MemorySnapshotStore implements SnapshotStore {
  /** Every snapshot ever saved, in order; superseded ones are replaced in place, never removed. */
  readonly all: Stored[] = [];
  writes = 0;

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
