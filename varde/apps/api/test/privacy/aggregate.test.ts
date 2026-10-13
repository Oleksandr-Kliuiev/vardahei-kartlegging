// Task 0.15: class `aggregate` — threshold k, complementary suppression, small clients only in
// the sum, no row data in the output, part × population (negative tests of ADR-021/ADR-025).
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import {
  type AggregateQuery,
  type AggregateResult,
  type Cell,
  PrivacyService,
  PrivacyViolation,
} from '../../src/modules/privacy/privacy.service.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { FixtureSource, ROUND_ANONYMOUS, ROUND_INITIALS } from '../support/fixture-source.js';

const NUMBERS = ['n', 'numerator', 'denominator', 'missing'];
const ROW_KEYS = ['respondent_key', 'answers', 'submission_id'];

function service(source = new FixtureSource()): PrivacyService {
  return new PrivacyService({} as PrismaService, source, {
    k: 3,
    exact_counts: ['responses_total'],
  });
}

type Over = { [K in keyof AggregateQuery]?: AggregateQuery[K] | undefined };

function q(over: Over = {}): AggregateQuery {
  const merged: Over = {
    round: ROUND_INITIALS,
    population: 'round_client',
    part: 'common',
    client: 'kunde-a',
    question: 'F12',
    option: 'ja',
    ...over,
  };
  if (merged.client === undefined) delete merged.client;
  return merged as AggregateQuery;
}

const cell = (r: AggregateResult, group: string): Cell | undefined =>
  r.cells.find((c) => c.group === group);

/** Every key that appears anywhere in the JSON of `value`. */
function jsonKeys(value: unknown): string[] {
  const keys: string[] = [];
  JSON.stringify(value, (k, v: unknown) => {
    if (k !== '') keys.push(k);
    return v;
  });
  return keys;
}

describe('privacy aggregate (0.15)', () => {
  it('n = 2 → suppressed; the JSON of the cell has no n, numerator, denominator, missing', async () => {
    const r = await service().aggregate(q({ client: 'kunde-b' }));
    const total = cell(r, 'all');
    expect(total).toEqual({ group: 'all', suppressed: true });
    expect(jsonKeys(total).filter((k) => NUMBERS.includes(k))).toEqual([]);
    expect(r.cells.every((c) => c.suppressed)).toBe(true);
  });

  it('total 5, role A 3, role B 2 → B suppressed and one of {total, A}', async () => {
    const r = await service().aggregate(q());
    expect(cell(r, 'role:kontor')).toEqual({ group: 'role:kontor', suppressed: true });
    const totalHidden = cell(r, 'all')?.suppressed === true;
    const aHidden = cell(r, 'role:sal')?.suppressed === true;
    expect(totalHidden || aHidden).toBe(true);
  });

  it('visible cells carry n, numerator, denominator, missing', async () => {
    const r = await service().aggregate(q());
    expect(cell(r, 'all')).toEqual({
      group: 'all',
      suppressed: false,
      n: 5,
      numerator: 3,
      denominator: 5,
      missing: 0,
    });
  });

  it('a small client is visible only in the sum of all_clients', async () => {
    const r = await service().aggregate(q({ population: 'all_clients', client: undefined }));
    expect(cell(r, 'client:kunde-b')).toEqual({ group: 'client:kunde-b', suppressed: true });
    expect(cell(r, 'all')).toMatchObject({ suppressed: false, n: 7, numerator: 4 });
  });

  it.each([ROUND_INITIALS, ROUND_ANONYMOUS])(
    'the JSON has no respondent_key, answers, submission_id (round %s)',
    async (round) => {
      for (const population of ['round_client', 'all_clients'] as const) {
        const r = await service().aggregate(
          q({ round, population, client: population === 'round_client' ? 'kunde-a' : undefined }),
        );
        expect(jsonKeys(r).filter((k) => ROW_KEYS.includes(k))).toEqual([]);
      }
    },
  );

  it('the same result in both identification modes', async () => {
    const a = await service().aggregate(q({ round: ROUND_INITIALS }));
    const b = await service().aggregate(q({ round: ROUND_ANONYMOUS }));
    expect({ ...a, round: 'x' }).toEqual({ ...b, round: 'x' });
  });

  it('part = leader with round_client → PrivacyViolation', async () => {
    await expect(service().aggregate(q({ part: 'leader' }))).rejects.toBeInstanceOf(
      PrivacyViolation,
    );
  });

  it('leaders_all with part = common → PrivacyViolation', async () => {
    await expect(
      service().aggregate(q({ population: 'leaders_all', client: undefined })),
    ).rejects.toBeInstanceOf(PrivacyViolation);
  });

  it('leaders_all: only the total over all clients, below k suppressed', async () => {
    const r = await service().aggregate(
      q({ population: 'leaders_all', part: 'leader', client: undefined, question: 'B13' }),
    );
    expect(r.cells).toEqual([{ group: 'all', suppressed: true }]);
  });

  it('round_client without a client, or all_clients with one → PrivacyViolation', async () => {
    await expect(service().aggregate(q({ client: undefined }))).rejects.toBeInstanceOf(
      PrivacyViolation,
    );
    await expect(service().aggregate(q({ population: 'all_clients' }))).rejects.toBeInstanceOf(
      PrivacyViolation,
    );
  });
});
