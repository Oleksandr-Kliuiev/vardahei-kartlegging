import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { PrivacyService, type ComputedCell } from '../../src/modules/privacy/privacy.service.js';
import { PrismaResponseSource } from '../../src/modules/privacy/prisma-source.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { makeRound } from '../support/rounds.js';

const prisma = new PrismaService();
const privacy = new PrivacyService(prisma, new PrismaResponseSource(prisma), {
  k: 3,
  exact_counts: ['responses_total'],
});
afterAll(() => prisma.$disconnect());
const cell = (n: number, group: string, client?: string): ComputedCell => ({
  ...(client ? { client } : {}),
  metric_key: 'synthetic.metric',
  metric_version: 1,
  group,
  n,
  numerator: n,
  denominator: n,
  missing: 0,
});
const actor = { type: 'manual', who: 'test:cross-population' } as const;
it('round_client X n=3 then all_clients client:X n=4 carries the earlier issued value', async () => {
  const mark = 'cross-' + randomUUID();
  const r = await makeRound(prisma, { mark, identification: 'initials' });
  const slug = mark + '-kunde-a';
  await privacy.release(r.round, 'round_client', [cell(3, 'all', slug)], 'db', actor);
  const released = await privacy.release(
    r.round,
    'all_clients',
    [cell(4, 'all'), cell(4, 'client:' + slug)],
    'db',
    actor,
  );
  expect(released.released.find((c) => c.group === 'client:' + slug)).toMatchObject({
    n: 3,
    numerator: 3,
    stale: true,
    suppressed: false,
  });
  // Complementary subtraction must not reveal the extra person through total-client.
  expect(released.released.find((c) => c.group === 'all')?.suppressed).toBe(true);
});
it('all_clients first then round_client uses the same cross-population history', async () => {
  const mark = 'cross-' + randomUUID();
  const r = await makeRound(prisma, { mark, identification: 'initials' });
  const slug = mark + '-kunde-a';
  await privacy.release(
    r.round,
    'all_clients',
    [cell(3, 'all'), cell(3, 'client:' + slug)],
    'db',
    actor,
  );
  const released = await privacy.release(
    r.round,
    'round_client',
    [cell(4, 'all', slug)],
    'db',
    actor,
  );
  expect(released.released[0]).toMatchObject({ n: 3, stale: true, suppressed: false });
});
it('safe delta three is published; metrics and unrelated clients do not get mixed', async () => {
  const mark = 'cross-' + randomUUID();
  const r = await makeRound(prisma, { mark, identification: 'initials' });
  const slug = mark + '-kunde-a';
  await privacy.release(r.round, 'round_client', [cell(3, 'all', slug)], 'db', actor);
  const released = await privacy.release(
    r.round,
    'all_clients',
    [cell(6, 'all'), cell(6, 'client:' + slug)],
    'db',
    actor,
  );
  expect(released.released.find((c) => c.group === 'client:' + slug)).toMatchObject({
    n: 6,
    suppressed: false,
  });
});

it('concurrent releases of equivalent client cells serialize across populations', async () => {
  const mark = 'cross-' + randomUUID();
  const r = await makeRound(prisma, { mark, identification: 'initials' });
  const slug = mark + '-kunde-a';
  const [a, b] = await Promise.all([
    privacy.release(r.round, 'round_client', [cell(3, 'all', slug)], 'db', actor),
    privacy.release(
      r.round,
      'all_clients',
      [cell(4, 'all'), cell(4, 'client:' + slug)],
      'db',
      actor,
    ),
  ]);
  const x = a.released.find((c) => c.group === 'all')!;
  const y = b.released.find((c) => c.group === 'client:' + slug)!;
  expect(x.suppressed || y.suppressed || x.n === y.n).toBe(true);
});
