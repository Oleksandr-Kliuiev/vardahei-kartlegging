import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { ForgetService } from '../../src/modules/retention/forget.service.js';
import { DeletionLedger } from '../../src/modules/retention/ledger.js';
import { PrivacyService } from '../../src/modules/privacy/privacy.service.js';
import { SvarImportService } from '../../src/modules/imports/svar-import.js';
import { QuotaService } from '../../src/modules/responses/quota.service.js';
import { dashboardFixture, type DashboardFixture } from '../dashboard/fixture.js';
import { fixtureText } from '../support/fixtures.js';
import { insertResponse, withPg } from '../support/rounds.js';
import { cookieHeader } from '../support/auth-app.js';
import {
  cleanupSubmissions,
  postSubmission,
  submissionBody,
  submissionRound,
  storedSubmissions,
} from '../support/submissions.js';

let f: DashboardFixture, forget: ForgetService;
const count = () =>
  withPg(async (c) =>
    Number((await c.query<{ n: string }>('SELECT count(*) n FROM response')).rows[0].n),
  );
const first = (round: string, part = 'common') =>
  withPg(
    async (c) =>
      (
        await c.query<{
          submission_id: string;
          source_id: string;
          respondent_key: string;
          client_id: string;
        }>(
          'SELECT r.submission_id,r.source_id,r.respondent_key,rc.client_id FROM response r JOIN round_client rc ON rc.id=r.round_client_id WHERE rc.round_id=$1 AND part=$2 LIMIT 1',
          [round, part],
        )
      ).rows[0]!,
  );
beforeAll(async () => {
  f = await dashboardFixture();
  forget = f.app.get(ForgetService);
}, 180_000);
afterAll(async () => {
  await f.close();
});
it('requires session and a reason; unauthenticated HTTP is 401', async () => {
  await expect(
    forget.forget({ scope: 'submissions', submission_ids: [randomUUID()] }, 'reason', undefined),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    forget.forget({ scope: 'client', client: randomUUID() }, '', f.session),
  ).rejects.toMatchObject({ status: 400 });
  expect((await f.post('/api/admin/retention/forget')).statusCode).toBe(401);
});
it('dry-run shows both parts and makes no ledger entry', async () => {
  const r = await first(f.tryggleik);
  const before = await count();
  const requests = await f.prisma.deletionRequest.count();
  const preview = await forget.forget(
    { scope: 'client', client: r.client_id },
    'synthetic request',
    f.session,
    true,
  );
  expect(preview.common).toBeGreaterThan(0);
  expect(preview.leader).toBeGreaterThan(0);
  expect(await count()).toBe(before);
  expect(await f.prisma.deletionRequest.count()).toBe(requests);
  // 3a: the dry run is in AuditLog with the scope and counts only (no client, key or reason).
  const [looked] = await f.prisma.auditLog.findMany({
    where: { what: 'retention.forget.preview' },
    orderBy: { at: 'desc' },
    take: 1,
  });
  expect(looked?.details).toEqual({
    scope: 'client',
    common: preview.common,
    leader: preview.leader,
    total: preview.total,
  });
  expect(JSON.stringify(looked)).not.toContain(r.client_id);
  expect(JSON.stringify(looked)).not.toContain('synthetic request');
});
it.each(['ØH', 'Z', 'ZZTESTAB', ' øh '])(
  'HTTP forget normalizes and deletes respondent key %j',
  async (input) => {
    const live = await submissionRound(f);
    try {
      await withPg((db) =>
        insertResponse(db, {
          round_client_id: live.rc.id,
          respondent_key: input.trim().toUpperCase(),
          answers: { F12: 'ja' },
        }),
      );
      const response = await f.app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/admin/retention/forget',
          headers: { cookie: cookieHeader(f.cookie) },
          payload: {
            scope: {
              scope: 'respondent',
              client: live.rc.client_id,
              round: live.round.id,
              respondent_key: input,
            },
            reason: 'Syntetisk førespurnad',
          },
        });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ common: 1, leader: 0 });
      expect(await storedSubmissions(live.rc.id)).toEqual([]);
    } finally {
      await cleanupSubmissions(f.prisma, [live.round.id]);
    }
  },
);
it.each(['', '   ', 'ZZTESTABC'])(
  'HTTP forget rejects empty or overlong respondent key %j',
  async (respondent_key) => {
    const response = await f.app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'POST',
        url: '/api/admin/retention/forget',
        headers: { cookie: cookieHeader(f.cookie) },
        payload: {
          scope: { scope: 'respondent', client: randomUUID(), respondent_key },
          reason: 'Syntetisk',
        },
      });
    expect(response.statusCode).toBe(400);
  },
);
it('anonymous respondent scope is rejected', async () => {
  const r = await first(f.anon);
  await expect(
    forget.forget(
      { scope: 'respondent', client: r.client_id, round: f.anon, respondent_key: 'ZZTEST' },
      'synthetic',
      f.session,
    ),
  ).rejects.toMatchObject({ status: 400 });
});
it('anonymous leader ID from actual endpoint deletes only the leader part', async () => {
  const r = await first(f.anon, 'leader');
  const result = await f.get(
    `/api/admin/clients/${r.client_id}/leader-answers?round=${f.anon}`,
    f.cookie,
  );
  const id = result.json<{ rows: { submission_id: string }[] }>().rows[0]!.submission_id;
  const before = await count();
  expect(
    await forget.forget(
      { scope: 'submissions', submission_ids: [id] },
      'synthetic leader',
      f.session,
    ),
  ).toMatchObject({ common: 0, leader: 1 });
  expect(await count()).toBe(before - 1);
  expect(
    await f.prisma.deletionTombstone.count({ where: { submission_id: id, part: 'leader' } }),
  ).toBe(1);
  expect(await f.app.get(DeletionLedger).tombstonesForKartlegging()).toContainEqual({
    source_id: r.source_id,
    part: 'leader',
  });
});
it('common anonymous part can be removed by submission ID', async () => {
  const r = await first(f.anon);
  expect(
    await forget.forget(
      { scope: 'submissions', submission_ids: [r.submission_id] },
      'synthetic common',
      f.session,
    ),
  ).toMatchObject({ common: 1, leader: 0 });
});
it('released snapshots remain byte-for-byte identical after identified deletion', async () => {
  const snapshots = () =>
    withPg(
      async (c) =>
        (
          await c.query<{ v: unknown }>(
            'SELECT row_to_json(s) v FROM aggregate_snapshot s ORDER BY id',
          )
        ).rows,
    );
  const before = await snapshots();
  const r = await first(f.tryggleik);
  await forget.forget(
    {
      scope: 'respondent',
      client: r.client_id,
      round: f.tryggleik,
      respondent_key: r.respondent_key,
    },
    'synthetic identified',
    f.session,
  );
  expect(await snapshots()).toEqual(before);
  const rows = await f.app.get(PrivacyService).rows({ round: f.tryggleik }, f.session);
  expect(rows.rows.some((x) => x.submission_id === r.submission_id)).toBe(false);
  // Forget on the full fixture set recomputes; the suite default of 60 s timed out on a loaded machine.
}, 240_000);
it('repeat is idempotent with no extra request or tombstone', async () => {
  const r = await first(f.ki);
  const scope = { scope: 'submissions' as const, submission_ids: [r.submission_id] };
  await forget.forget(scope, 'synthetic', f.session);
  const n = await f.prisma.deletionRequest.count();
  expect((await forget.forget(scope, 'synthetic', f.session)).total).toBe(0);
  expect(await f.prisma.deletionRequest.count()).toBe(n);
});
it('reimport suppresses removed parts and never resurrects them', async () => {
  const before = await count();
  const m = await f.app
    .get(SvarImportService)
    .importSvar(fixtureText('svar.synthetic.jsonl'), { who: 'test:forget' });
  expect(await count()).toBe(before);
  expect(
    Object.values(m.counts.rounds).reduce(
      (n, r) => n + r.common.suppressed + r.leader.suppressed,
      0,
    ),
  ).toBeGreaterThan(3);
  expect(
    Object.values(m.counts.rounds).reduce((n, r) => n + r.common.accepted + r.leader.accepted, 0),
  ).toBe(0);
});
it('audit failure rolls deletion and tombstones back together', async () => {
  const r = await first(f.ki);
  const real = f.prisma.$transaction.bind(f.prisma);
  const before = await count();
  const spy = vi.spyOn(f.prisma, '$transaction').mockImplementation((fn: unknown) =>
    real(async (tx) => {
      vi.spyOn(tx.auditLog, 'create').mockRejectedValue(new Error('audit down'));
      return (fn as (t: typeof tx) => Promise<unknown>)(tx);
    }),
  );
  try {
    await expect(
      forget.forget(
        { scope: 'submissions', submission_ids: [r.submission_id] },
        'synthetic',
        f.session,
      ),
    ).rejects.toThrow('audit down');
  } finally {
    spy.mockRestore();
  }
  expect(await count()).toBe(before);
  expect(
    await f.prisma.deletionTombstone.count({ where: { submission_id: r.submission_id } }),
  ).toBe(0);
});
it('ledger removes a restored row by identity and is idempotent', async () => {
  const r = await first(f.ki);
  const restored = await withPg(
    async (c) =>
      (
        await c.query<{ v: object }>(
          'SELECT row_to_json(r) v FROM response r WHERE submission_id=$1',
          [r.submission_id],
        )
      ).rows[0].v,
  );
  await forget.forget(
    { scope: 'submissions', submission_ids: [r.submission_id] },
    'synthetic restore',
    f.session,
  );
  await withPg(async (c) => {
    await c.query('INSERT INTO response SELECT * FROM json_populate_record(NULL::response,$1)', [
      JSON.stringify(restored),
    ]);
  });
  expect(await f.app.get(DeletionLedger).apply()).toBe(1);
  expect(await f.app.get(DeletionLedger).apply()).toBe(0);
});
it('real forget serializes against replay using the same UUID advisory lock', async () => {
  const live = await submissionRound(f);
  const body = submissionBody();
  try {
    const sent = await postSubmission(f, live.code, body);
    expect(sent.statusCode).toBe(201);
    const quota = vi.spyOn(f.app.get(QuotaService), 'consume');
    await withPg(async (c) => {
      await c.query('BEGIN');
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [body.submission_id]);
      let completed = false;
      const deleting = forget
        .forget(
          { scope: 'submissions', submission_ids: [body.submission_id] },
          'synthetic replay',
          f.session,
        )
        .then((r) => {
          completed = true;
          return r;
        });
      await new Promise((r) => setTimeout(r, 100));
      expect(completed).toBe(false);
      await c.query('COMMIT');
      await deleting;
    });
    expect((await postSubmission(f, live.code, body)).body).toBe(sent.body);
    expect((await postSubmission(f, live.code, { ...body, duration_s: 1 })).statusCode).toBe(409);
    expect(await storedSubmissions(live.rc.id)).toEqual([]);
    expect(quota).not.toHaveBeenCalled();
    quota.mockRestore();
  } finally {
    await cleanupSubmissions(f.prisma, [live.round.id]);
  }
});
it('client scope removes all surveys, both parts and free text, without another client', async () => {
  const r = await first(f.tryggleik);
  const before = await count();
  const n = await forget.forget(
    { scope: 'client', client: r.client_id },
    'synthetic full client',
    f.session,
  );
  expect(n.common).toBeGreaterThan(0);
  expect(n.leader).toBeGreaterThan(0);
  expect(await count()).toBe(before - n.total);
  expect(
    await withPg(async (c) =>
      Number(
        (
          await c.query<{ n: string }>(
            'SELECT count(*) n FROM response r JOIN round_client rc ON rc.id=r.round_client_id WHERE rc.client_id=$1',
            [r.client_id],
          )
        ).rows[0].n,
      ),
    ),
  ).toBe(0);
});
