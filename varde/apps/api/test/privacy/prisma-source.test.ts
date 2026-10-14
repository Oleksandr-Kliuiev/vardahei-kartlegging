// Task 1.4b (integration): class `rows` through the Prisma response source in both modes.
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrivacyService, type PrivacySession } from '../../src/modules/privacy/privacy.service.js';
import { PrismaResponseSource } from '../../src/modules/privacy/prisma-source.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { insertResponse, makeRound, type TestRound, withPg } from '../support/rounds.js';

const prisma = new PrismaService();
const MARK = `ps-${Date.now().toString(36)}`;
const session: PrivacySession = { sid: 's1', oid: MARK, name: 'Test Admin', via: 'entra' };
const service = new PrivacyService(prisma, new PrismaResponseSource(prisma), {
  k: 3,
  exact_counts: ['responses_total'],
});
let initials: TestRound;
let anonymous: TestRound;

beforeAll(async () => {
  initials = await makeRound(prisma, {
    mark: `${MARK}-i`,
    identification: 'initials',
    clients: ['a', 'b'],
  });
  anonymous = await makeRound(prisma, { mark: `${MARK}-n`, identification: 'none' });
  await withPg(async (c) => {
    await insertResponse(c, {
      round_client_id: initials.clients.a!.roundClient,
      respondent_key: 'QAXAM',
      role: 'sal',
    });
    await insertResponse(c, {
      round_client_id: initials.clients.b!.roundClient,
      respondent_key: 'QBXAM',
    });
    await insertResponse(c, {
      round_client_id: initials.clients.a!.roundClient,
      respondent_key: 'QAXAM',
      part: 'leader',
      answers: { B13: 'nei' },
    });
    await insertResponse(c, { round_client_id: anonymous.clients['kunde-a']!.roundClient });
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { who: `entra:${MARK}` } });
  await prisma.$disconnect();
});

describe('Prisma response source (1.4b)', () => {
  it('roundMode follows Round.identification', async () => {
    const source = new PrismaResponseSource(prisma);
    expect(await source.roundMode(initials.round)).toBe('initials');
    expect(await source.roundMode(anonymous.round)).toBe('none');
  });

  it('rows in mode initials: common part only, with respondent_key, by client', async () => {
    const all = await service.rows({ round: initials.round }, session);
    expect(all.mode).toBe('initials');
    expect(all.rows.map((r) => [r.part, r.respondent_key]).sort()).toEqual([
      ['common', 'QAXAM'],
      ['common', 'QBXAM'],
    ]);
    expect(all.rows.every((r) => r.submitted_day === '2026-10-13')).toBe(true);
    const a = await service.rows({ round: initials.round, client: `${MARK}-i-a` }, session);
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0]!.role).toBe('sal');
  });

  it('rows in mode none: no respondent_key', async () => {
    const r = await service.rows({ round: anonymous.round }, session);
    expect(r.mode).toBe('none');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).not.toHaveProperty('respondent_key');
  });
});
