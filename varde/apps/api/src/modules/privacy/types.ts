// Types of the privacy module (0.15, ADR-021, ADR-025). Imported from outside the module only
// through privacy.service.ts (lint 0.2b).
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Part, Population } from '@varde/schema/metrics/populations';

/** Round.identification, copied from the template version (ADR-025). */
export type RoundMode = 'initials' | 'none';

/** One response as the source returns it; never leaves the module except through `rows`. */
export interface ResponseRow {
  round_client: string;
  client: string;
  part: Part;
  role: string;
  /** Normalised initials; only in rounds with identification = initials. */
  respondent_key?: string;
  answers: Readonly<Record<string, unknown>>;
  /** Day only (YYYY-MM-DD). */
  submitted_day: string;
}

/** Who reads (the admin session from AdminSessionGuard). */
export interface PrivacySession {
  sid: string;
  oid: string | null;
  name: string | null;
  via: string;
}

export interface AggregateQuery {
  round: string;
  population: Population;
  part: Part;
  /** Required for population round_client. */
  client?: string;
  question: string;
  /** Option counted in `numerator`. */
  option: string;
}

export interface VisibleCell {
  group: string;
  suppressed: false;
  n: number;
  numerator: number;
  denominator: number;
  missing: number;
}

/** A suppressed cell carries no numbers at all. */
export interface SuppressedCell {
  group: string;
  suppressed: true;
}

export type Cell = VisibleCell | SuppressedCell;

export interface AggregateResult {
  round: string;
  population: Population;
  client?: string;
  question: string;
  option: string;
  /** Day of computation (timestamps are days, ADR-021). */
  day: string;
  cells: Cell[];
}

export interface RowsQuery {
  round: string;
  /** One client or, when omitted, all clients of the round. */
  client?: string;
}

/** A row of class `rows`: common part only; `respondent_key` only in mode initials. */
export interface PrivacyRow {
  round_client: string;
  client: string;
  part: 'common';
  role: string;
  respondent_key?: string;
  answers: Readonly<Record<string, unknown>>;
  submitted_day: string;
}

export interface RowsResult {
  round: string;
  client?: string;
  mode: RoundMode;
  rows: PrivacyRow[];
}

/** A query that would release something the contract forbids (part × population). */
export class PrivacyViolation extends ForbiddenException {
  override readonly name = 'PrivacyViolation';
}

/** No admin session (→ 401). */
export class UnauthorizedError extends UnauthorizedException {
  override readonly name = 'UnauthorizedError';
}

/** The view does not exist in this round (anonymous round → 404, ADR-025). */
export class NotFoundError extends NotFoundException {
  override readonly name = 'NotFoundError';
}
