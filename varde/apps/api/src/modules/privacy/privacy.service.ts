// The only release point for responses and aggregates (0.15, ADR-021): every other module
// imports only this file (lint 0.2b). Types and errors of the module are re-exported here.
import { Inject, Injectable, type Provider } from '@nestjs/common';
import { type PrivacyConfig, readPrivacyConfig } from '../../config/privacy-config.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { aggregate, assertAggregateQuery } from './aggregate.js';
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
}

/**
 * Providers of the module for a response source. Not mounted in AppModule in stage 0: the Prisma
 * source arrives with the Response table (1.4b); tests mount it with an in-memory source.
 */
export function privacyProviders(source: ResponseSource): Provider[] {
  return [
    { provide: RESPONSE_SOURCE, useValue: source },
    { provide: PRIVACY_CONFIG, useFactory: () => readPrivacyConfig() },
    PrivacyService,
  ];
}
