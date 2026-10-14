import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { RoundsService } from '../../src/modules/rounds/rounds.service.js';
import { expect, it } from 'vitest';
import { SeedTemplatesService } from '../../src/modules/surveys/seed-templates.js';
import { MetricsService } from '../../src/modules/metrics/metrics.service.js';
import { submissionApp, submissionBody, postSubmission } from '../support/submissions.js';
import { withPg } from '../support/rounds.js';
import { SEED_DIR } from '../support/seed-dir.js';

it('manual endpoint carries a single new answer; automatic close shares its issue history', async () => {
  const t = await submissionApp();
  let rcId: string | undefined;
  try {
    await t.app.get(SeedTemplatesService).seedTemplates(SEED_DIR, 'test:history');
    await t.app.get(MetricsService).seedMetrics(SEED_DIR);
    const seeded = await t.prisma.templateVersion.findFirstOrThrow({
      where: { template: { key: 'tryggleik' }, label: '2026-10-13', status: 'published' },
    });
    const service = t.app.get(RoundsService);
    const mark = 'test-history-' + randomUUID();
    const client = await t.prisma.client.create({
      data: { slug: mark, name: 'Syntetisk historikk' },
    });
    const round = await service.create(
      { name: mark, template_version_id: seeded.id },
      'test:history',
    );
    const rc = await service.addClient(
      round.id,
      { client_id: client.id, population_snapshot: 100, deadline: '2099-06-01' },
      'test:history',
    );
    rcId = rc.id;
    const opened = await service.openClient(rc.id, 'test:history');
    const f = { round, rc, code: opened.code! };
    const session = await t.store.create({
      oid: 'test:history',
      name: 'synthetic',
      via: 'entra',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const cookie = t.app.getHttpAdapter().getInstance().signCookie(session.sid);
    const post = (action: string) =>
      t.app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: `/api/admin/rounds/${f.round.id}/${action}`,
          headers: { cookie: `varde_session=${encodeURIComponent(cookie)}` },
        });
    const values = () =>
      withPg(
        async (c) =>
          (
            await c.query<{
              metric_key: string;
              group: string;
              n: number;
              numerator: number;
              denominator: number;
              stale: boolean;
            }>(
              "SELECT metric_key,\"group\",n,numerator,denominator,stale FROM aggregate_snapshot WHERE round_id=$1 AND status='released' AND population='round_client' AND metric_key ILIKE '%f12%' ORDER BY metric_key,\"group\"",
              [f.round.id],
            )
          ).rows,
      );
    for (let i = 0; i < 3; i++)
      expect(
        (await postSubmission(t, f.code, submissionBody({ F1: 'ZZTEST', F2: 'kontor', F12: 'ja' })))
          .statusCode,
      ).toBe(201);
    expect((await post('release')).statusCode).toBe(201);
    const first = await values();
    expect(first.length).toBeGreaterThan(0);
    const clientCsv = () =>
      t.get(`/api/admin/exports/client.csv?round=${f.round.id}&client=${client.id}`, {
        varde_session: cookie,
      });
    const issuedCsv = await clientCsv();
    expect(issuedCsv.statusCode).toBe(200);
    expect(
      (await postSubmission(t, f.code, submissionBody({ F1: 'ZZTEST', F2: 'kontor', F12: 'nei' })))
        .statusCode,
    ).toBe(201);
    // An external client CSV cannot expose a new live answer before the next release.
    expect((await clientCsv()).body).toBe(issuedCsv.body);
    expect((await post('release')).statusCode).toBe(201);
    const second = await values();
    const counts = (rows: typeof first) =>
      rows.map(({ stale, ...r }) => {
        void stale;
        return r;
      });
    expect(counts(second)).toEqual(counts(first));
    expect(second.some((s) => s.stale)).toBe(true);
    expect((await post('close')).statusCode).toBe(201);
    expect(counts(await values())).toEqual(counts(first));
    const what = (
      await t.prisma.auditLog.findMany({ where: { target: 'round:' + f.round.id } })
    ).map((r) => r.what);
    expect(what).toContain('privacy.release.manual');
    expect(what).toContain('privacy.release.auto');
  } finally {
    if (rcId) await withPg((c) => c.query('DELETE FROM response WHERE round_client_id=$1', [rcId]));
    await t.app.close();
  }
}, 180_000);
