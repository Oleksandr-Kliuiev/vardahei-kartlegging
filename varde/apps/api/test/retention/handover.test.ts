import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrivacyService } from '../../src/modules/privacy/privacy.service.js';
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter, TextWriter } from '@zip.js/zip.js';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { HandoverService } from '../../src/modules/retention/handover.js';
import { dashboardFixture, type DashboardFixture } from '../dashboard/fixture.js';
import { withPg } from '../support/rounds.js';
import { parseCsv } from '../support/csv.js';
import { cookieHeader } from '../support/auth-app.js';

let f: DashboardFixture, service: HandoverService;
beforeAll(async () => {
  f = await dashboardFixture();
  service = f.app.get(HandoverService);
}, 180_000);
afterAll(async () => {
  await f.close();
});
async function read(bytes: Uint8Array, password: string) {
  const zip = new ZipReader(new Uint8ArrayReader(bytes), { password, useWebWorkers: false });
  try {
    const files: Record<string, string> = {};
    for (const entry of await zip.getEntries()) {
      expect(entry.encrypted).toBe(true);
      expect(entry.extraFieldAES?.strength).toBe(3);
      if (!entry.directory)
        files[entry.filename] = Buffer.from(await entry.getData(new Uint8ArrayWriter())).toString(
          'utf8',
        );
    }
    return files;
  } finally {
    await zip.close();
  }
}
const client = () => f.prisma.client.findUniqueOrThrow({ where: { slug: 'daco' } });
it('AES-256 ZIP contains all client common and leader rows, including anonymous and external round 1', async () => {
  const c = await client();
  for (const [round, part, key] of [
    [f.tryggleik, 'common', 'ZZTEST'],
    [f.anon, 'common', null],
    [f.anon, 'leader', null],
  ] as const) {
    const rc = await f.prisma.roundClient.findFirstOrThrow({
      where: { round_id: round, client_id: c.id },
    });
    await f.prisma.$transaction((tx) =>
      f.app.get(PrivacyService).store.insertParts(tx, [
        {
          round_client_id: rc.id,
          part,
          role: part === 'leader' ? 'leiar' : 'kontor',
          lang: 'nn',
          respondent_key: key,
          answers: {},
          free: {},
          submission_id: randomUUID(),
          content_hash: randomBytes(32).toString('hex'),
          source_id: null,
          duration_s: null,
          submitted_day: '2026-10-14',
        },
      ]),
    );
  }
  const result = await service.create(
    c.id,
    'Syntetisk skriftleg førespurnad',
    'syntetisk mottakar',
    f.session,
  );
  expect(result.password).toMatch(/^[A-Za-z0-9_-]{24}$/);
  const bytes = service.take(result.handover_id);
  const files = await read(bytes, result.password);
  expect(Object.keys(files).sort()).toEqual(['LES-MEG.txt', 'leiar.csv', 'samla.csv', 'svar.csv']);
  expect(files['svar.csv']).toMatch(/^\uFEFFInitialar;Kunde;/);
  expect(files['svar.csv']).toContain('2026-01-');
  expect(files['svar.csv']).toContain('Innsending utan svar');
  expect(files['leiar.csv']).toContain('Innsending utan svar');
  expect(files['LES-MEG.txt']!.split('\r\n').length).toBeGreaterThan(3);
  const counts = await withPg(
    async (db) =>
      (
        await db.query<{ part: string; n: string }>(
          'SELECT part,count(*) n FROM response r JOIN round_client rc ON rc.id=r.round_client_id WHERE rc.client_id=$1 GROUP BY part',
          [c.id],
        )
      ).rows,
  );
  for (const [part, name] of [
    ['common', 'svar.csv'],
    ['leader', 'leiar.csv'],
  ] as const) {
    const rows = parseCsv(files[name]!).slice(1);
    const ids = new Set(rows.map((r) => r[12]));
    expect(ids.size).toBe(Number(counts.find((r) => r.part === part)!.n));
    expect(rows.every((r) => r[8] === (part === 'common' ? 'A' : 'B'))).toBe(true);
  }
  const anonymous = await withPg(
    async (db) =>
      (
        await db.query<{ id: string }>(
          "SELECT coalesce(r.source_id, r.submission_id::text) id FROM response r JOIN round_client rc ON rc.id=r.round_client_id JOIN round rd ON rd.id=rc.round_id WHERE rc.client_id=$1 AND rd.identification='none'",
          [c.id],
        )
      ).rows,
  );
  const anonIds = new Set(anonymous.map((r) => r.id));
  for (const name of ['svar.csv', 'leiar.csv'])
    for (const row of parseCsv(files[name]!).slice(1))
      if (anonIds.has(row[12]!)) expect(row[0]).toBe('');
  expect(files['samla.csv']).not.toMatch(/all_clients|leaders_all/);
  for (const other of ['Gasta', 'Kviknes', 'Maskinsenteret', 'SFHS', 'Tharaso'])
    for (const name of ['svar.csv', 'leiar.csv', 'samla.csv'])
      expect(files[name]).not.toContain(other);
  const audit = await f.prisma.auditLog.findFirstOrThrow({
    where: { what: 'retention.handover' },
    orderBy: { at: 'desc' },
  });
  expect(audit).toMatchObject({
    who: 'entra:test:dashboard-reader',
    details: {
      client: c.id,
      recipient: 'syntetisk mottakar',
      reason: 'Syntetisk skriftleg førespurnad',
    },
  });
  expect(JSON.stringify(audit)).not.toContain(result.password);
  const wrong = new ZipReader(new Uint8ArrayReader(bytes), {
    password: 'wrong',
    useWebWorkers: false,
  });
  try {
    const entry = (await wrong.getEntries()).find((e) => !e.directory)!;
    if (!entry.directory) await expect(entry.getData(new TextWriter())).rejects.toThrow();
  } finally {
    await wrong.close();
  }
});
it('POST is no-store; unauthenticated GET cannot consume the file; successful GET is one-shot', async () => {
  const c = await client();
  const api = f.app.getHttpAdapter().getInstance();
  const post = await api.inject({
    method: 'POST',
    url: `/api/admin/clients/${c.id}/handover`,
    headers: { cookie: cookieHeader(f.cookie) },
    payload: { reason: 'Syntetisk', recipient: 'Syntetisk mottakar' },
  });
  expect(post.statusCode).toBe(201);
  expect(post.headers['cache-control']).toBe('no-store');
  const { handover_id, password } = post.json<{ handover_id: string; password: string }>();
  expect((await f.get(`/api/admin/handover/${handover_id}.zip`)).statusCode).toBe(401);
  const zip = await f.get(`/api/admin/handover/${handover_id}.zip`, f.cookie);
  expect(zip.statusCode).toBe(200);
  expect(zip.headers['cache-control']).toBe('no-store');
  expect((await read(zip.rawPayload, password))['LES-MEG.txt']).toContain('Vardahei IT');
  expect((await f.get(`/api/admin/handover/${handover_id}.zip`, f.cookie)).statusCode).toBe(404);
});
it('file expires after ten minutes and is removed', async () => {
  const result = await service.create((await client()).id, 'Syntetisk', 'Mottakar', f.session);
  expect(() => service.take(result.handover_id, Date.now() + 600_001)).toThrow();
  expect(() => service.take(result.handover_id)).toThrow();
});
it('handover requires a session and nonempty written reason and recipient', async () => {
  const c = await client();
  await expect(service.create(c.id, 'reason', 'recipient', undefined)).rejects.toMatchObject({
    status: 401,
  });
  await expect(service.create(c.id, '', 'recipient', f.session)).rejects.toMatchObject({
    status: 400,
  });
  expect((await f.post(`/api/admin/clients/${c.id}/handover`)).statusCode).toBe(401);
});
it('audit failure returns neither ZIP nor password', async () => {
  const real = f.prisma.$transaction.bind(f.prisma);
  const spy = vi.spyOn(f.prisma, '$transaction').mockImplementation((fn: unknown) =>
    real(async (tx) => {
      vi.spyOn(tx.auditLog, 'create').mockRejectedValue(new Error('audit down'));
      return (fn as (t: typeof tx) => Promise<unknown>)(tx);
    }),
  );
  try {
    await expect(
      service.create((await client()).id, 'reason', 'recipient', f.session),
    ).rejects.toThrow('audit down');
  } finally {
    spy.mockRestore();
  }
});
