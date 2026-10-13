// In-memory ResponseSource of the privacy tests (0.15): two rounds with the same synthetic
// responses — `r-init` (identification initials) and `r-anon` (none). Initials are made up.
import type { Prisma } from '@prisma/client';
import type {
  ResponseRow,
  ResponseSource,
  RoundMode,
  SourceQuery,
} from '../../src/modules/privacy/privacy.service.js';

export const ROUND_INITIALS = 'r-init';
export const ROUND_ANONYMOUS = 'r-anon';
/** Every respondent_key in the fixture (the leak tests search outputs for them). */
export const FIXTURE_INITIALS = ['AAXYZ', 'BBXYZ', 'CCXYZ', 'DDXYZ', 'EEXYZ', 'FFXYZ', 'GGXYZ'];

const DAY = '2026-10-13';

type Seed = [client: string, role: string, key: string, f12: string, part?: 'common' | 'leader'];

/** kunde-a: 5 common (sal 3, kontor 2) + 1 leader; kunde-b: 2 common (small client) + 1 leader. */
const SEED: Seed[] = [
  ['kunde-a', 'sal', 'AAXYZ', 'ja'],
  ['kunde-a', 'sal', 'BBXYZ', 'ja'],
  ['kunde-a', 'sal', 'CCXYZ', 'nei'],
  ['kunde-a', 'kontor', 'DDXYZ', 'ja'],
  ['kunde-a', 'kontor', 'EEXYZ', 'delvis'],
  ['kunde-a', 'leiar', 'AAXYZ', 'skrive', 'leader'],
  ['kunde-b', 'sal', 'FFXYZ', 'ja'],
  ['kunde-b', 'prod', 'GGXYZ', 'nei'],
  ['kunde-b', 'leiar', 'FFXYZ', 'nei', 'leader'],
];

function rowsOf(round: string): ResponseRow[] {
  return SEED.map(([client, role, key, answer, part = 'common']) => ({
    round_client: `${round}:${client}`,
    client,
    part,
    role,
    ...(round === ROUND_INITIALS ? { respondent_key: key } : {}),
    answers: part === 'common' ? { F12: answer, F21: `fritekst frå ${key}` } : { B13: answer },
    submitted_day: DAY,
  }));
}

export class FixtureSource implements ResponseSource {
  readonly rounds = new Map<string, { mode: RoundMode; rows: ResponseRow[] }>([
    [ROUND_INITIALS, { mode: 'initials', rows: rowsOf(ROUND_INITIALS) }],
    [ROUND_ANONYMOUS, { mode: 'none', rows: rowsOf(ROUND_ANONYMOUS) }],
  ]);
  failRead = false;
  /** Transactions the reads ran in (undefined = outside a transaction). */
  readonly reads: (Prisma.TransactionClient | undefined)[] = [];

  /** Adds `count` common responses to one client/role (history-of-releases tests). */
  add(round: string, client: string, role: string, count: number, f12 = 'ja'): void {
    const r = this.rounds.get(round);
    if (r === undefined) throw new Error(`unknown round ${round}`);
    for (let i = 0; i < count; i += 1) {
      r.rows.push({
        round_client: `${round}:${client}`,
        client,
        part: 'common',
        role,
        answers: { F12: f12 },
        submitted_day: DAY,
      });
    }
  }

  roundMode(round: string): Promise<RoundMode> {
    const r = this.rounds.get(round);
    return r === undefined
      ? Promise.reject(new Error(`unknown round ${round}`))
      : Promise.resolve(r.mode);
  }

  read(query: SourceQuery, tx?: Prisma.TransactionClient): Promise<ResponseRow[]> {
    this.reads.push(tx);
    if (this.failRead) return Promise.reject(new Error('read failed'));
    const all = this.rounds.get(query.round)?.rows ?? [];
    return Promise.resolve(
      all.filter(
        (r) =>
          (query.client === undefined || r.client === query.client) &&
          (query.part === undefined || r.part === query.part),
      ),
    );
  }
}
