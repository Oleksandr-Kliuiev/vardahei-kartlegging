// The live poll migration down and up again (3b, acceptance): down.sql leaves the client row of live
// polls (its live rounds refer to it) as an ordinary client; applying the migration again makes it
// the technical client once more, so a new live poll can be made. Works on its own database.
import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { API_DIR, databaseUrl, prisma, withDatabase } from '../support/prisma-cli.js';
import { seminarApp } from '../support/seminars.js';
import { livePoll } from '../support/live.js';

const MIGRATION = '20261016140000_live_poll';
const name = `varde_live_rb_${randomBytes(4).toString('hex')}`;
const parent = databaseUrl();
const url = withDatabase(parent, name);
const admin = new PrismaClient({ datasourceUrl: parent });

beforeAll(async () => {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  const deploy = prisma(['migrate', 'deploy'], url);
  expect(deploy.status, deploy.output).toBe(0);
  process.env.DATABASE_URL = url;
}, 120_000);
afterAll(async () => {
  process.env.DATABASE_URL = parent;
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.$disconnect();
});

it('down → up keeps the technical client, and a new live poll can be made', async () => {
  const first = await seminarApp();
  const before = await livePoll(first);
  const client = await first.prisma.client.findFirstOrThrow({ where: { kind: 'seminar' } });
  await first.app.close();

  const down = prisma(
    [
      'db',
      'execute',
      '--url',
      url,
      '--file',
      join(API_DIR, 'prisma', 'migrations', MIGRATION, 'down.sql'),
    ],
    url,
  );
  expect(down.status, down.output).toBe(0);
  const again = prisma(['migrate', 'deploy'], url);
  expect(again.status, again.output).toBe(0);

  const second = await seminarApp();
  try {
    const restored = await second.prisma.client.findUniqueOrThrow({ where: { id: client.id } });
    expect(restored.kind).toBe('seminar');
    const after = await livePoll(second);
    const rc = await second.prisma.roundClient.findFirstOrThrow({
      where: { round_id: after.round },
    });
    expect(rc.client_id).toBe(client.id);
    // The old live round keeps its RoundClient on the same client; it lost only its question states.
    const old = await second.prisma.roundClient.findFirstOrThrow({
      where: { round_id: before.round },
    });
    expect(old.client_id).toBe(client.id);
  } finally {
    await second.app.close();
  }
});
