// The only release point for responses and aggregates (0.15, ADR-021): every other module
// imports only this file (lint 0.2b). Types and errors of the module are re-exported here.
import {
  type DynamicModule,
  Global,
  Inject,
  Injectable,
  Module,
  type Provider,
} from '@nestjs/common';
import type { Population } from '@varde/schema/metrics/populations';
import { type PrivacyConfig, readPrivacyConfig } from '../../config/privacy-config.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { aggregate, assertAggregateQuery } from './aggregate.js';
import { PrismaResponseSource } from './prisma-source.js';
import {
  type ComputedCell,
  release,
  type ReleaseActor,
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

export const PRIVACY_CONFIG = Symbol('PRIVACY_CONFIG');

export { RESPONSE_SOURCE } from './source.js';
export type { ResponseSource, SourceQuery } from './source.js';
export type { RowsDb } from './rows.js';
export { ReleaseRejected } from './release.js';
export { PrismaResponseSource } from './prisma-source.js';
export type {
  ComputedCell,
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
   * Manual (admin action) and automatic (round closed) differ only in `actor`.
   */
  release(
    round: string,
    population: Population,
    cells: readonly ComputedCell[],
    store: SnapshotStore,
    actor: ReleaseActor,
  ): Promise<ReleaseResult> {
    return release(round, population, cells, store, actor, {
      config: this.config,
      audit: { write: async (data) => void (await this.prisma.auditLog.create({ data })) },
    });
  }
}

/**
 * Providers of the module for a response source; tests mount them with an in-memory source,
 * the application with the Prisma source (`PrivacyModule.forApp()`, 1.4b).
 */
export function privacyProviders(source: ResponseSource): Provider[] {
  return [
    { provide: RESPONSE_SOURCE, useValue: source },
    { provide: PRIVACY_CONFIG, useFactory: () => readPrivacyConfig() },
    PrivacyService,
  ];
}

/** Providers of the application: the Prisma response source (1.4b). */
export function prismaPrivacyProviders(): Provider[] {
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
