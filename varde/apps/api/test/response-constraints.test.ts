// Task 1.4b (integration): constraints of response and round (ADR-006, ADR-022, ADR-024, ADR-025).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { insertResponse, makeRound, type TestRound, withPg } from './support/rounds.js';

const prisma = new PrismaService();
const MARK = `rc-${Date.now().toString(36)}`;
let initials: TestRound;
let anonymous: TestRound;
let draft: TestRound;

beforeAll(async () => {
  initials = await makeRound(prisma, { mark: `${MARK}-i`, identification: 'initials' });
  anonymous = await makeRound(prisma, { mark: `${MARK}-n`, identification: 'none' });
  draft = await makeRound(prisma, { mark: `${MARK}-d`, identification: null, status: 'draft' });
});

afterAll(() => prisma.$disconnect());

const rc = (r: TestRound) => r.clients['kunde-a']!.roundClient;

describe('response and round constraints (1.4b)', () => {
  it('response has exactly one FK: round_client (none to progress_event or between parts)', async () => {
    const fks = await withPg((c) =>
      c.query<{ ref: string }>(
        `SELECT ccu.table_name AS ref FROM information_schema.table_constraints tc
           JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
          WHERE tc.table_name = 'response' AND tc.constraint_type = 'FOREIGN KEY'`,
      ),
    );
    expect(fks.rows.map((r) => r.ref)).toEqual(['round_client']);
  });

  it('a duplicate submission_id is rejected', async () => {
    const id = randomUUID();
    await withPg(async (c) => {
      await insertResponse(c, { round_client_id: rc(initials), submission_id: id });
      await expect(
        insertResponse(c, { round_client_id: rc(initials), submission_id: id }),
      ).rejects.toThrow(/submission_id/);
    });
  });

  it('respondent_key in a round with none or with NULL identification (draft) → trigger error', async () => {
    await withPg(async (c) => {
      await insertResponse(c, { round_client_id: rc(initials), respondent_key: 'QAXAM' });
      await expect(
        insertResponse(c, { round_client_id: rc(anonymous), respondent_key: 'QAXAM' }),
      ).rejects.toThrow(/response_respondent_key_mode/);
      await expect(
        insertResponse(c, { round_client_id: rc(draft), respondent_key: 'QAXAM' }),
      ).rejects.toThrow(/response_respondent_key_mode/);
      await insertResponse(c, { round_client_id: rc(anonymous), respondent_key: null });
    });
  });

  it('a round outside draft without identification → CHECK round_mode_fixed', async () => {
    await expect(
      prisma.round.create({ data: { name: MARK, type: 'regular', status: 'open' } }),
    ).rejects.toThrow(/round_mode_fixed/);
    await expect(
      prisma.round.update({ where: { id: draft.round }, data: { status: 'open' } }),
    ).rejects.toThrow(/round_mode_fixed/);
  });

  it('duplicate (source_id, part) is rejected; the same source_id with the other part is fine', async () => {
    const source = `src-${MARK}`;
    await withPg(async (c) => {
      await insertResponse(c, { round_client_id: rc(initials), source_id: source, part: 'common' });
      await expect(
        insertResponse(c, { round_client_id: rc(initials), source_id: source, part: 'common' }),
      ).rejects.toThrow(/source_id/);
      await insertResponse(c, { round_client_id: rc(initials), source_id: source, part: 'leader' });
      await insertResponse(c, { round_client_id: rc(initials), source_id: null });
      await insertResponse(c, { round_client_id: rc(initials), source_id: null });
    });
  });

  it('template_version_id or identification of an open round cannot change (round_freeze)', async () => {
    const open = await makeRound(prisma, {
      mark: `${MARK}-o`,
      identification: 'initials',
      status: 'open',
    });
    await expect(
      prisma.round.update({
        where: { id: open.round },
        data: { template_version_id: initials.version },
      }),
    ).rejects.toThrow(/round_freeze/);
    await expect(
      prisma.round.update({ where: { id: open.round }, data: { identification: 'none' } }),
    ).rejects.toThrow(/round_freeze/);
    await prisma.round.update({ where: { id: open.round }, data: { status: 'closed' } });
    const d = await prisma.round.update({
      where: { id: draft.round },
      data: { template_version_id: initials.version },
    });
    expect(d.template_version_id).toBe(initials.version);
  });
});
