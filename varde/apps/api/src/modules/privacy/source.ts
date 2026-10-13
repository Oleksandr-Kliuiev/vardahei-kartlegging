// Where responses come from (0.15). The Prisma implementation arrives with the Response table
// (1.4b) and lives in this file: besides privacy.service.ts, the only place allowed to read
// `response` (lint varde/privacy-only-release). Tests use test/support/fixture-source.ts.
import type { Prisma } from '@prisma/client';
import type { Part } from '@varde/schema/metrics/populations';
import type { ResponseRow, RoundMode } from './types.js';

export const RESPONSE_SOURCE = Symbol('RESPONSE_SOURCE');

export interface SourceQuery {
  round: string;
  client?: string;
  part?: Part;
}

/** `tx` is the transaction of the caller (class `rows`: AuditLog and read in one transaction). */
export interface ResponseSource {
  roundMode(round: string, tx?: Prisma.TransactionClient): Promise<RoundMode>;
  read(query: SourceQuery, tx?: Prisma.TransactionClient): Promise<ResponseRow[]>;
}
