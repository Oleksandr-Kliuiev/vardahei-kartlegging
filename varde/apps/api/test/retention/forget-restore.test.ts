// Real dump/restore path, isolated DB. The hosting operator/CI runs this with Docker.
import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import type { Prisma } from '@prisma/client';
import { expect, it } from 'vitest';
import { JobsService } from '../../src/jobs/jobs.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { ForgetService } from '../../src/modules/retention/forget.service.js';
import { DeletionLedger } from '../../src/modules/retention/ledger.js';
import { SvarImportService } from '../../src/modules/imports/svar-import.js';
import { SeedService } from '../../src/modules/rounds/seed.service.js';
import { startApp } from '../support/auth-app.js';
import { databaseUrl, withDatabase, prisma as migrate } from '../support/prisma-cli.js';
import { clients, kundar, tilgang, fixtureText } from '../support/fixtures.js';
import { SEED_DIR } from '../support/seed-dir.js';

it.skipIf(process.env.VARDE_RESTORE_DOCKER !== '1')(
  'dump before import → forget anonymous leader → restore plus current ledger → common accepted and leader suppressed',
  async () => {
    const saved = databaseUrl(),
      name = 'varde_restore_' + randomUUID().replaceAll('-', '');
    const parent = new pg.Client({ connectionString: saved });
    await parent.connect();
    await parent.query(`CREATE DATABASE "${name}"`);
    const url = withDatabase(saved, name);
    const dir = mkdtempSync(join(tmpdir(), 'varde-forget-restore-'));
    process.env.DATABASE_URL = url;
    const migration = migrate(['migrate', 'deploy'], url);
    expect(migration.status).toBe(0);
    const t = await startApp({ SESSION_SECRET: randomBytes(32).toString('hex') });
    const db = t.app.get(PrismaService);
    const docker = (command: string[], input?: Buffer) => {
      try {
        return execFileSync(
          'docker',
          [
            'run',
            '--rm',
            '-i',
            '--network',
            'host',
            '-e',
            'DATABASE_URL=' + url,
            'postgres:17.6-bookworm',
            'sh',
            '-c',
            command.join(' '),
          ],
          { input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 },
        );
      } catch {
        throw new Error('synthetic dump/restore failed');
      }
    };
    try {
      const jobs = t.app.get(JobsService);
      for (let i = 0; i < 100 && !jobs.running; i++) await new Promise((r) => setTimeout(r, 100));
      await jobs.stop();
      await t.app
        .get(SeedService)
        .seedAll({
          clients: clients(),
          kundar: kundar(),
          tilgang: tilgang(),
          seedDir: SEED_DIR,
          who: 'test:restore',
        });
      const dump = docker(['pg_dump', '-d', '"$DATABASE_URL"', '-Fc', '-N', 'pgboss']);
      expect(dump.length).toBeGreaterThan(1000);
      const line = fixtureText('svar.synthetic.jsonl')
        .trim()
        .split('\n')
        .map(
          (l) =>
            JSON.parse(l) as { id: string; skjema: string; versjon: string; leiardel: boolean },
        )
        .find((r) => r.skjema === 'ki' && r.versjon === '2026-10-12' && r.leiardel)!;
      const input = JSON.stringify(line) + '\n';
      const importer = t.app.get(SvarImportService);
      const m = await importer.importSvar(input, { who: 'test:restore' });
      expect(Object.values(m.counts.rounds)[0]!.leader.accepted).toBe(1);
      const conn = new pg.Client({ connectionString: url });
      await conn.connect();
      const leader = (
        await conn.query<{ submission_id: string }>(
          "SELECT submission_id FROM response WHERE source_id=$1 AND part='leader'",
          [line.id],
        )
      ).rows[0]!;
      await conn.end();
      await t.app
        .get(ForgetService)
        .forget(
          { scope: 'submissions', submission_ids: [leader.submission_id] },
          'synthetic restore',
          { sid: randomUUID(), oid: 'test:restore', name: null, via: 'entra' },
        );
      const requests = await db.deletionRequest.findMany();
      const tombstones = await db.deletionTombstone.findMany();
      await db.$disconnect();
      docker(
        ['pg_restore', '-d', '"$DATABASE_URL"', '--clean', '--if-exists', '--single-transaction'],
        dump,
      );
      await db.deletionRequest.createMany({
        data: requests.map((r) => ({ ...r, scope_ref: r.scope_ref as Prisma.InputJsonValue })),
      });
      await db.deletionTombstone.createMany({ data: tombstones });
      expect(await t.app.get(DeletionLedger).apply()).toBe(0); // dump predates all responses
      const again = await importer.importSvar(input, { who: 'test:restore' });
      expect(Object.values(again.counts.rounds)[0]).toMatchObject({
        common: { accepted: 1 },
        leader: { accepted: 0, suppressed: 1 },
      });
      // Second dump predates a deletion, so apply-db must physically remove its restored common.
      const postImport = docker(['pg_dump', '-d', '"$DATABASE_URL"', '-Fc', '-N', 'pgboss']);
      const c = new pg.Client({ connectionString: url });
      await c.connect();
      const common = (
        await c.query<{ submission_id: string }>(
          'SELECT submission_id FROM response WHERE source_id=$1',
          [line.id],
        )
      ).rows[0]!;
      await c.end();
      await t.app
        .get(ForgetService)
        .forget(
          { scope: 'submissions', submission_ids: [common.submission_id] },
          'synthetic restore',
          { sid: randomUUID(), oid: 'test:restore', name: null, via: 'entra' },
        );
      const latestRequests = await db.deletionRequest.findMany();
      const latest = await db.deletionTombstone.findMany();
      await db.$disconnect();
      docker(
        ['pg_restore', '-d', '"$DATABASE_URL"', '--clean', '--if-exists', '--single-transaction'],
        postImport,
      );
      await db.deletionRequest.createMany({
        data: latestRequests.map((r) => ({
          ...r,
          scope_ref: r.scope_ref as Prisma.InputJsonValue,
        })),
        skipDuplicates: true,
      });
      await db.deletionTombstone.createMany({ data: latest, skipDuplicates: true });
      expect(await t.app.get(DeletionLedger).apply()).toBe(1);
      expect(await t.app.get(DeletionLedger).apply()).toBe(0);
    } finally {
      await t.app.close();
      process.env.DATABASE_URL = saved;
      await parent.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',
        [name],
      );
      await parent.query(`DROP DATABASE "${name}"`);
      await parent.end();
      rmSync(dir, { recursive: true, force: true });
    }
  },
  180_000,
);
