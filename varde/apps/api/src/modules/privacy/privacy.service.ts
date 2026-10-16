// The only release point for responses and aggregates (0.15, ADR-021): every other module
// imports only this file (lint 0.2b). Types and errors of the module are re-exported here.
import {
  type DynamicModule,
  Global,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  type Provider,
} from '@nestjs/common';
import { cells as metricCells } from '@varde/rules/findings';
import type { MetricDefinition } from '@varde/schema/metrics/metric-definition';
import type { Population } from '@varde/schema/metrics/populations';
import type { Prisma } from '@prisma/client';
import { type PrivacyConfig, readPrivacyConfig } from '../../config/privacy-config.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { suppressedGroups, aggregate, assertAggregateQuery } from './aggregate.js';
import { liveCells, type ViewCell } from './view-cells.js';
import { type ClientGroup, clientGroup, cohortCells } from './cohort.js';
import { PrivacyViolation } from './types.js';
import { PrismaSnapshotStore } from './prisma-snapshot-store.js';
import { PrismaResponseSource, progressView } from './prisma-source.js';
import { handover } from './handover.js';
import {
  type ArchiveRefs,
  ArchivedSnapshot,
  assertRestorable,
  fromArchived,
  toArchived,
} from './archive.js';
import { ResponseStore } from './response-store.js';
import { ParticipantStore } from './participants.js';
import { LiveTally } from './live.js';
import {
  type ComputedCell,
  release,
  type ReleaseActor,
  type ReleaseOptions,
  type ReleaseResult,
  type SnapshotStore,
} from './release.js';
import {
  employeeHistory,
  leaderAnswers,
  masterAnalyseExport,
  perEmployee,
  rows,
  type RowsContext,
} from './rows.js';
import { RESPONSE_SOURCE, type ResponseSource } from './source.js';
import type {
  AggregateQuery,
  AggregateResult,
  PrivacySession,
  RowsQuery,
  RowsResult,
} from './types.js';

const PRIVACY_CONFIG = Symbol('PRIVACY_CONFIG');
export type { ResponseSource, SourceQuery } from './source.js';
export type { RowsDb } from './rows.js';
export type { ViewCell } from './view-cells.js';
export type { ClientGroup } from './cohort.js';
export { ReleaseRejected } from './release.js';
export { ArchiveRejected, ArchivedSnapshot } from './archive.js';
export type { ArchiveRefs } from './archive.js';
export type { DeleteScope, DeleteCounts, ResponsePart } from './response-store.js';
export type { ContactChange, ParticipantDeleteCounts, ParticipantInput } from './participants.js';
export type { LiveCount, LiveOptionResult, LiveResult } from './live.js';
export type {
  ComputedCell,
  HistoricCell,
  ReleaseOptions,
  ReleaseActor,
  ReleaseAudit,
  ReleaseResult,
  SnapshotStore,
} from './release.js';
export { NotFoundError, PrivacyViolation, UnauthorizedError } from './types.js';
export type {
  AggregateQuery,
  AggregateResult,
  Cell,
  PrivacyRow,
  PrivacySession,
  ResponseRow,
  RoundMode,
  RowsQuery,
  RowsResult,
  SuppressedCell,
  VisibleCell,
} from './types.js';

@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(RESPONSE_SOURCE) private readonly source: ResponseSource,
    @Inject(PRIVACY_CONFIG) private readonly config: PrivacyConfig,
  ) {}

  /** The only write path of Response (import 1.8, Submission API 1.16). */
  readonly store = new ResponseStore();
  /** The only read and write path of seminar Contact and Registration (3.1). */
  readonly participants = new ParticipantStore();
  /** The only outputs of seminar live poll answers (3.4): the count and shown results with k. */
  readonly live = new LiveTally(() => this.config.k);

  /** Live progress is always aggregate; session IDs and duration rows never leave privacy. */
  progress(round: string, now = new Date()) {
    return progressView(this.prisma, this.config.k, round, now);
  }

  private get ctx(): RowsContext {
    return { db: this.prisma, source: this.source };
  }

  /** Dashboard: closed/archived rounds never fall back to raw, even before release. */
  async viewCells(
    round: string,
    population: Population,
    defs: readonly MetricDefinition[],
    client?: string,
    releasedOnly = false,
  ): Promise<ViewCell[]> {
    const r = await this.prisma.round.findUnique({ where: { id: round } });
    if (!r) throw new NotFoundException('Runden finst ikkje.');
    if (population === 'round_client' && !client)
      throw new PrivacyViolation('round_client needs a client');
    if (population !== 'round_client' && client)
      throw new PrivacyViolation('population cannot have client');
    if (!releasedOnly && r.status !== 'closed' && r.status !== 'archived') {
      return liveCells(await this.computeCells(round, population, defs, client), this.config.k);
    }
    const c = client ? await this.prisma.client.findUnique({ where: { slug: client } }) : null;
    if (client && !c) throw new NotFoundException('Kunden finst ikkje.');
    const allowed = new Set(
      defs.filter((d) => d.populations.includes(population)).map((d) => `${d.key}@${d.version}`),
    );
    const found = await this.prisma.aggregateSnapshot.findMany({
      where: { round_id: round, population, status: 'released', client_id: c?.id ?? null },
      orderBy: [{ metric_key: 'asc' }, { group: 'asc' }],
    });
    return found
      .filter((s) =>
        [...allowed].some((key) => {
          const [base, version] = key.split('@');
          return (
            s.metric_version === Number(version) &&
            (s.metric_key === base || s.metric_key.startsWith(`${base}.`))
          );
        }),
      )
      .map((s): ViewCell => {
        const base = { metric_key: s.metric_key, metric_version: s.metric_version, group: s.group };
        return s.suppressed
          ? { ...base, suppressed: true }
          : {
              ...base,
              suppressed: false,
              n: s.n,
              numerator: s.numerator,
              denominator: s.denominator,
              missing: s.missing,
              stale: s.stale,
              release_id: s.release_id,
            };
      });
  }

  /** Round clients that have released `round_client` snapshots (5.1: a client report can be
   * made). Existence only: no cell leaves this method. */
  async releasedRoundClients(rounds: readonly string[]): Promise<Set<string>> {
    if (rounds.length === 0) return new Set();
    const found = await this.prisma.aggregateSnapshot.findMany({
      where: { round_id: { in: [...rounds] }, population: 'round_client', status: 'released' },
      distinct: ['round_client_id'],
      select: { round_client_id: true },
    });
    return new Set(found.flatMap((s) => (s.round_client_id ? [s.round_client_id] : [])));
  }

  /** Role × client intersections also form a partition of the round's role total.
   * Recheck subtraction against that total; independently safe client cells alone do not suffice. */
  async roleClientCells(
    round: string,
    defs: readonly MetricDefinition[],
    role: string,
  ): Promise<ViewCell[]> {
    const common = defs.filter((d) => d.part === 'common');
    const totals = (await this.viewCells(round, 'all_clients', common)).filter(
      (c) => c.group === `role:${role}`,
    );
    const clients = await this.prisma.roundClient.findMany({
      where: { round_id: round },
      include: { client: true },
    });
    const parts = (
      await Promise.all(
        clients.map(async (rc) =>
          (await this.viewCells(round, 'round_client', common, rc.client.slug))
            .filter((c) => c.group === `role:${role}`)
            .map((c) => ({ ...c, group: `client:${rc.client.slug}` })),
        ),
      )
    ).flat();
    return totals.flatMap((total): ViewCell[] => {
      const own = parts.filter(
        (c) => c.metric_key === total.metric_key && c.metric_version === total.metric_version,
      );
      if (total.suppressed)
        return [
          { ...total, group: 'all' },
          ...own.map((c): ViewCell => ({
            metric_key: c.metric_key,
            metric_version: c.metric_version,
            group: c.group,
            suppressed: true,
          })),
        ];
      const visible = own.filter(
        (c): c is Extract<ViewCell, { suppressed: false }> => !c.suppressed,
      );
      const hidden = suppressedGroups({ ...total, group: 'all' }, visible, this.config.k);
      return [
        { ...total, group: 'all' },
        ...own.map((c): ViewCell =>
          hidden.has(c.group)
            ? {
                metric_key: c.metric_key,
                metric_version: c.metric_version,
                group: c.group,
                suppressed: true,
              }
            : c,
        ),
      ];
    });
  }

  /** Filter a historical population using already released client cells. Hidden components
   * cannot be treated as zero or reconstructed by subtracting from the historical total. */
  cohortCells(
    round: string,
    clients: readonly string[],
    defs: readonly MetricDefinition[],
    role?: string,
  ): Promise<ViewCell[]> {
    return cohortCells(this.prisma, this.read, round, clients, defs, role);
  }

  /** Some clients of a round (3.9: the clients of a seminar), from its all_clients view only:
   * their total and their own cells, a hidden client hides the total (privacy/cohort.ts). */
  clientGroup(
    round: string,
    defs: readonly MetricDefinition[],
    clients: readonly string[],
  ): Promise<ClientGroup> {
    return clientGroup(this.read, round, defs, clients);
  }

  private readonly read = (
    round: string,
    population: Population,
    defs: readonly MetricDefinition[],
    client?: string,
  ) => this.viewCells(round, population, defs, client);

  /** Class `aggregate`: live view of the admins and the input of release(); never rows. */
  async aggregate(query: AggregateQuery): Promise<AggregateResult> {
    assertAggregateQuery(query);
    const read = await this.source.read({
      round: query.round,
      part: query.part,
      ...(query.population === 'round_client' && query.client !== undefined
        ? { client: query.client }
        : {}),
    });
    return aggregate(query, read, this.config.k);
  }

  /**
   * Cells of metric definitions for one population (1.10): rows are read by the source and
   * counted by @varde/rules/findings inside this module; only cells leave it. `client` (slug)
   * is required for round_client.
   */
  async computeCells(
    round: string,
    population: Population,
    defs: readonly MetricDefinition[],
    client?: string,
  ): Promise<ComputedCell[]> {
    if (population === 'round_client' && client === undefined) {
      throw new PrivacyViolation('round_client cells need a client');
    }
    const read = await this.source.read({
      round,
      ...(population === 'round_client' && client !== undefined ? { client } : {}),
    });
    const rows = read.map((r) => ({
      client: r.client,
      role: r.role,
      part: r.part,
      answers: r.answers,
    }));
    return defs.flatMap((d) =>
      metricCells(d, rows, population, population === 'round_client' ? client : undefined),
    );
  }

  /** Released and superseded snapshots of one round for its archive (5.2); suppressed cells
   * leave without numbers. */
  async archiveSnapshots(round: string): Promise<ArchivedSnapshot[]> {
    return (await new PrismaSnapshotStore(this.prisma).archived(round)).map(toArchived);
  }

  /** The only snapshot write besides release(): a round archive restored into a database that
   * has no snapshot of the round (5.2), in the caller's transaction. Status, values and release
   * ids stay as archived; checked against k, populations and the archive's own definitions. */
  async restoreSnapshots(
    tx: Prisma.TransactionClient,
    round: string,
    snapshots: readonly unknown[],
    refs: ArchiveRefs,
  ): Promise<number> {
    const parsed = snapshots.map((s) => ArchivedSnapshot.parse(s));
    assertRestorable(parsed, this.config, refs);
    return new PrismaSnapshotStore(tx).restore(
      round,
      parsed.map((s) => fromArchived(round, s)),
    );
  }

  handover(client: string, reason: string, recipient: string, session: PrivacySession | undefined) {
    return handover(client, reason, recipient, session, this.ctx);
  }

  /** Class `rows`: admin session, AuditLog in the same transaction as the read. */
  rows(query: RowsQuery, session: PrivacySession | null | undefined): Promise<RowsResult> {
    return rows(query, session, this.ctx);
  }

  get minimumGroupSize(): number {
    return this.config.k;
  }

  employeeHistory(
    query: RowsQuery,
    previous: string | undefined,
    session: PrivacySession | null | undefined,
    audit: 'privacy.rows' | 'exports.master_analyse' = 'privacy.rows',
  ) {
    return employeeHistory(query, previous, session, this.ctx, audit);
  }

  leaderAnswers(query: RowsQuery & { client: string }, session: PrivacySession | null | undefined) {
    return leaderAnswers(query, session, this.ctx);
  }

  perEmployee(query: RowsQuery, session: PrivacySession | null | undefined): Promise<RowsResult> {
    return perEmployee(query, session, this.ctx);
  }

  masterAnalyseExport(
    query: RowsQuery,
    session: PrivacySession | null | undefined,
  ): Promise<RowsResult> {
    return masterAnalyseExport(query, session, this.ctx);
  }

  /**
   * privacy.release(): the only way to released snapshots (history of releases, ADR-021).
   * Manual (admin action) and automatic (round closed) differ only in `actor`. With `store =
   * 'db'` (the application) supersede, save, the metric set and AuditLog run in ONE Prisma
   * transaction (1.4c); an explicit store (tests) is used as given.
   */
  release(
    round: string,
    population: Population,
    cells: readonly ComputedCell[],
    store: SnapshotStore | 'db',
    actor: ReleaseActor,
    opts: ReleaseOptions = {},
  ): Promise<ReleaseResult> {
    if (store !== 'db') {
      return release(
        round,
        population,
        cells,
        store,
        actor,
        {
          config: this.config,
          audit: { write: async (data) => void (await this.prisma.auditLog.create({ data })) },
        },
        opts,
      );
    }
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'privacy.release:' + round}, 0))`;
        return release(
          round,
          population,
          cells,
          new PrismaSnapshotStore(tx),
          actor,
          {
            config: this.config,
            audit: { write: async (data) => void (await tx.auditLog.create({ data })) },
          },
          opts,
        );
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }
}

/** Providers of the application: the Prisma response source (1.4b). */
function prismaPrivacyProviders(): Provider[] {
  return [
    {
      provide: RESPONSE_SOURCE,
      useFactory: (p: PrismaService) => new PrismaResponseSource(p),
      inject: [PrismaService],
    },
    { provide: PRIVACY_CONFIG, useFactory: () => readPrivacyConfig() },
    PrivacyService,
  ];
}

/** The privacy module of the application (global: every domain module reads through it). */
@Global()
@Module({})
export class PrivacyModule {
  static forApp(): DynamicModule {
    return {
      module: PrivacyModule,
      providers: prismaPrivacyProviders(),
      exports: [PrivacyService],
    };
  }
}
