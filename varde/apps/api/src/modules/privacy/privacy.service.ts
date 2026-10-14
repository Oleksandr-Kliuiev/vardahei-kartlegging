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
import { type PrivacyConfig, readPrivacyConfig } from '../../config/privacy-config.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { aggregate, assertAggregateQuery } from './aggregate.js';
import { PrivacyViolation } from './types.js';
import { PrismaSnapshotStore } from './prisma-snapshot-store.js';
import { PrismaResponseSource } from './prisma-source.js';
import { ResponseStore } from './response-store.js';
import { progressCells } from './progress.js';
import {
  type ComputedCell,
  release,
  type ReleaseActor,
  type ReleaseOptions,
  type ReleaseResult,
  type SnapshotStore,
} from './release.js';
import { masterAnalyseExport, perEmployee, rows, type RowsContext } from './rows.js';
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
export { ReleaseRejected } from './release.js';
export type { ResponsePart } from './response-store.js';
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

  /** Live progress is always aggregate; session IDs and duration rows never leave privacy. */
  progress(round: string, now = new Date()) {
    return this.prisma.$transaction(
      async (tx) => {
        const found = await tx.round.findUnique({
          where: { id: round },
          select: { template_version: { select: { content: true } } },
        });
        if (!found) throw new NotFoundException('Runden finst ikkje.');
        const content = found.template_version?.content as { questions?: unknown[] } | undefined;
        const questionCount = content?.questions?.length ?? 0;
        const clients = await tx.roundClient.findMany({
          where: { round_id: round },
          select: { id: true, population_snapshot: true },
        });
        const events = await tx.progressEvent.findMany({
          where: {
            round_client: { round_id: round },
            at: { gte: new Date(now.getTime() - 24 * 3600_000) },
          },
          select: {
            round_client_id: true,
            session_id: true,
            question_no: true,
            finished: true,
            at: true,
          },
        });
        const durations = await tx.response.findMany({
          where: { round_client: { round_id: round }, part: 'common', duration_s: { not: null } },
          select: { round_client_id: true, duration_s: true },
        });
        const totals = await tx.response.groupBy({
          by: ['round_client_id'],
          where: { round_client: { round_id: round }, part: 'common' },
          _count: { _all: true },
          _max: { submitted_day: true },
        });
        return {
          class: 'aggregate' as const,
          clients: clients.map((rc) => ({
            round_client_id: rc.id,
            population_snapshot: rc.population_snapshot,
            responses_total: totals.find((t) => t.round_client_id === rc.id)?._count._all ?? 0,
            last_response_day:
              totals.find((t) => t.round_client_id === rc.id)?._max.submitted_day ?? null,
            ...progressCells(
              events.filter((e) => e.round_client_id === rc.id),
              durations.filter((d) => d.round_client_id === rc.id).map((d) => d.duration_s!),
              now,
              this.config.k,
              questionCount,
            ),
          })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  private get ctx(): RowsContext {
    return { db: this.prisma, source: this.source };
  }

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

  /** Class `rows`: admin session, AuditLog in the same transaction as the read. */
  rows(query: RowsQuery, session: PrivacySession | null | undefined): Promise<RowsResult> {
    return rows(query, session, this.ctx);
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
      (tx) =>
        release(
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
        ),
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
