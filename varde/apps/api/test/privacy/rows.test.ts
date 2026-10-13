// Task 0.15 (integration, Postgres): class `rows` — admin session, AuditLog in the same real
// Prisma transaction as the read, rollback both ways, respondent_key only in mode initials.
import 'reflect-metadata';
import type { Prisma } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  NotFoundError,
  type PrivacySession,
  type RowsDb,
  UnauthorizedError,
} from '../../src/modules/privacy/privacy.service.js';
import { PrivacyService } from '../../src/modules/privacy/privacy.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import {
  FIXTURE_INITIALS,
  FixtureSource,
  ROUND_ANONYMOUS,
  ROUND_INITIALS,
} from '../support/fixture-source.js';

const prisma = new PrismaService();
const MARK = `test-rows-${Date.now()}`;
const session: PrivacySession = { sid: 's1', oid: MARK, name: 'Test Admin', via: 'entra' };
const WHO = `entra:${MARK}`;
let source: FixtureSource;

/** PrismaService whose transaction client fails on auditLog.create. */
function failingAudit(): RowsDb {
  return {
    $transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
      prisma.$transaction((tx) =>
        fn(
          new Proxy(tx, {
            get(target, prop, receiver) {
              if (prop !== 'auditLog') return Reflect.get(target, prop, receiver) as unknown;
              return {
                create: () => Promise.reject(new Error('audit write failed')),
                update: () => Promise.reject(new Error('audit write failed')),
              };
            },
          }),
        ),
      ),
  };
}

const service = (db: RowsDb = prisma) =>
  new PrivacyService(db as PrismaService, source, { k: 3, exact_counts: ['responses_total'] });
const audits = () => prisma.auditLog.findMany({ where: { who: WHO }, orderBy: { at: 'asc' } });

beforeEach(async () => {
  source = new FixtureSource();
  await prisma.auditLog.deleteMany({ where: { who: WHO } });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { who: WHO } });
  await prisma.$disconnect();
});

describe('privacy rows (0.15)', () => {
  it('without a session → UnauthorizedError, nothing read, no AuditLog', async () => {
    await expect(service().rows({ round: ROUND_INITIALS }, null)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(service().rows({ round: ROUND_INITIALS }, undefined)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(source.reads).toEqual([]);
    expect(await audits()).toEqual([]);
  });

  it('with a session → rows and exactly one AuditLog entry, written in the same transaction', async () => {
    const r = await service().rows({ round: ROUND_INITIALS, client: 'kunde-a' }, session);
    expect(r.rows).toHaveLength(5);
    const log = await audits();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      what: 'privacy.rows',
      target: `round:${ROUND_INITIALS}`,
      details: { round: ROUND_INITIALS, client: 'kunde-a', view: 'rows', count: 5 },
    });
    expect(source.reads).toHaveLength(1);
    expect(source.reads[0]).toBeDefined();
    expect(source.reads[0]).not.toBe(prisma);
  });

  it('AuditLog failure (injected) → no rows, nothing read', async () => {
    await expect(service(failingAudit()).rows({ round: ROUND_INITIALS }, session)).rejects.toThrow(
      'audit write failed',
    );
    expect(source.reads).toEqual([]);
  });

  it('read failure → no AuditLog entry (rollback)', async () => {
    source.failRead = true;
    await expect(service().rows({ round: ROUND_INITIALS }, session)).rejects.toThrow('read failed');
    expect(await audits()).toEqual([]);
  });

  it('mode none → rows without respondent_key; per employee and Master_Analyse → NotFoundError', async () => {
    const r = await service().rows({ round: ROUND_ANONYMOUS }, session);
    expect(r.mode).toBe('none');
    expect(r.rows.length).toBe(7);
    expect(r.rows.every((row) => !('respondent_key' in row))).toBe(true);
    await expect(service().perEmployee({ round: ROUND_ANONYMOUS }, session)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      service().masterAnalyseExport({ round: ROUND_ANONYMOUS }, session),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('mode initials → respondent_key present; per employee works with its own AuditLog', async () => {
    const r = await service().rows({ round: ROUND_INITIALS }, session);
    expect(r.rows.map((row) => row.respondent_key).sort()).toEqual(FIXTURE_INITIALS.slice().sort());
    const v = await service().perEmployee({ round: ROUND_INITIALS }, session);
    expect(v.rows).toHaveLength(7);
    expect((await audits()).map((a) => (a.details as { view: string }).view)).toEqual([
      'rows',
      'per_employee',
    ]);
  });

  it('part = leader never appears in rows', async () => {
    for (const round of [ROUND_INITIALS, ROUND_ANONYMOUS]) {
      const r = await service().rows({ round }, session);
      expect(r.rows.every((row) => row.part === 'common')).toBe(true);
      expect(JSON.stringify(r)).not.toContain('B13');
    }
  });

  it('AuditLog details never contain answers or respondent_key', async () => {
    await service().rows({ round: ROUND_INITIALS }, session);
    await service().perEmployee({ round: ROUND_INITIALS, client: 'kunde-b' }, session);
    for (const entry of await audits()) {
      const text = JSON.stringify(entry);
      expect(text).not.toMatch(/answers|respondent_key|F12|fritekst/);
      for (const initials of FIXTURE_INITIALS) expect(text).not.toContain(initials);
    }
  });
});
