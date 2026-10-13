// SnapshotStore on Prisma (1.4c): works inside the transaction of PrivacyService.release(), so
// supersede, save, the metric set and AuditLog commit or fail together. Domain `client` is the
// client slug; rows carry client_id and round_client_id. In the allow-list of
// varde/privacy-only-release (writes `aggregateSnapshot`).
import type { Prisma } from '@prisma/client';
import type {
  ReleasedSnapshot,
  SupersededSnapshot,
} from '@varde/schema/metrics/aggregate-snapshot';
import type { Population } from '@varde/schema/metrics/populations';
import type { HistoricCell, SnapshotStore } from './release.js';

type Row = Prisma.AggregateSnapshotGetPayload<object>;
const date = (d: Date | null): string => (d === null ? '' : d.toISOString().slice(0, 10));

export class PrismaSnapshotStore implements SnapshotStore {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  private async slugs(rows: readonly Row[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((r) => r.client_id).filter((x): x is string => x !== null))];
    if (ids.length === 0) return new Map();
    const found = await this.tx.client.findMany({
      where: { id: { in: ids } },
      select: { id: true, slug: true },
    });
    return new Map(found.map((c) => [c.id, c.slug]));
  }

  private async clientIds(
    round: string,
    slugs: readonly string[],
  ): Promise<Map<string, { client: string; rc: string | null }>> {
    if (slugs.length === 0) return new Map();
    const clients = await this.tx.client.findMany({
      where: { slug: { in: [...slugs] } },
      select: { id: true, slug: true },
    });
    const rcs = await this.tx.roundClient.findMany({
      where: { round_id: round, client_id: { in: clients.map((c) => c.id) } },
      select: { id: true, client_id: true },
    });
    const out = new Map<string, { client: string; rc: string | null }>();
    for (const c of clients)
      out.set(c.slug, { client: c.id, rc: rcs.find((r) => r.client_id === c.id)?.id ?? null });
    for (const s of slugs) if (!out.has(s)) throw new Error(`snapshot store: unknown client ${s}`);
    return out;
  }

  async listReleased(round: string, population: Population): Promise<ReleasedSnapshot[]> {
    const rows = await this.tx.aggregateSnapshot.findMany({
      where: { round_id: round, population, status: 'released' },
      orderBy: { id: 'asc' },
    });
    const slugs = await this.slugs(rows);
    return rows.map(
      (r) =>
        Object.freeze({
          round,
          population,
          ...(r.client_id === null ? {} : { client: slugs.get(r.client_id) ?? r.client_id }),
          metric_key: r.metric_key,
          metric_version: r.metric_version,
          group: r.group,
          n: r.n,
          numerator: r.numerator,
          denominator: r.denominator,
          missing: r.missing,
          suppressed: r.suppressed,
          ...(r.stale ? { stale: true } : {}),
          computed_at: date(r.computed_at),
          status: 'released' as const,
          released_at: date(r.released_at),
        }) as ReleasedSnapshot, // rows released earlier by markReleased; read back inside privacy
    );
  }

  async listHistory(round: string, population: Population): Promise<HistoricCell[][]> {
    const rows = await this.tx.aggregateSnapshot.findMany({
      where: { round_id: round, population, status: { in: ['released', 'superseded'] } },
    });
    const slugs = await this.slugs(rows);
    const byRelease = new Map<string, HistoricCell[]>();
    for (const r of rows) {
      const cell: HistoricCell = {
        ...(r.client_id === null ? {} : { client: slugs.get(r.client_id) ?? r.client_id }),
        metric_key: r.metric_key,
        metric_version: r.metric_version,
        group: r.group,
        n: r.n,
        suppressed: r.suppressed,
      };
      byRelease.set(r.release_id, [...(byRelease.get(r.release_id) ?? []), cell]);
    }
    return [...byRelease.values()];
  }

  async metricSet(round: string): Promise<readonly string[] | null> {
    const set = await this.tx.roundMetricSet.findUnique({ where: { round_id: round } });
    return set === null ? null : set.metric_keys;
  }

  async fixMetricSet(round: string, metrics: readonly string[]): Promise<void> {
    await this.tx.roundMetricSet.create({ data: { round_id: round, metric_keys: [...metrics] } });
  }

  async save(snapshots: readonly ReleasedSnapshot[], releaseId: string): Promise<void> {
    const first = snapshots[0];
    if (first === undefined) return;
    const ids = await this.clientIds(first.round, [
      ...new Set(snapshots.flatMap((s) => (s.client === undefined ? [] : [s.client]))),
    ]);
    await this.tx.aggregateSnapshot.createMany({
      data: snapshots.map((s) => ({
        round_id: s.round,
        population: s.population,
        client_id: s.client === undefined ? null : (ids.get(s.client)?.client ?? null),
        round_client_id: s.client === undefined ? null : (ids.get(s.client)?.rc ?? null),
        metric_key: s.metric_key,
        metric_version: s.metric_version,
        group: s.group,
        n: s.n,
        numerator: s.numerator,
        denominator: s.denominator,
        missing: s.missing,
        suppressed: s.suppressed,
        stale: s.stale === true,
        status: 'released',
        computed_at: new Date(`${s.computed_at}T00:00:00Z`),
        released_at: new Date(`${s.released_at}T00:00:00Z`),
        release_id: releaseId,
      })),
    });
  }

  async supersede(snapshots: readonly SupersededSnapshot[]): Promise<void> {
    const first = snapshots[0];
    if (first === undefined) return;
    const reasons = new Set(snapshots.map((s) => s.superseded_reason));
    if (reasons.size !== 1) throw new Error('snapshot store: one reason per supersede');
    // release() supersedes every current released snapshot of (round, population) at once.
    const count = await this.tx.aggregateSnapshot.updateMany({
      where: { round_id: first.round, population: first.population, status: 'released' },
      data: {
        status: 'superseded',
        superseded_at: new Date(),
        superseded_reason: first.superseded_reason,
      },
    });
    if (count.count !== snapshots.length) {
      throw new Error(
        `snapshot store: superseded ${count.count} rows, expected ${snapshots.length}`,
      );
    }
  }
}
