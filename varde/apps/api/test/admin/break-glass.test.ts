import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { breakGlassHash } from '../../src/cli.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { EventsService } from '../../src/modules/events/events.service.js';
import { RoundsService } from '../../src/modules/rounds/rounds.service.js';
import { startApp, type TestApp } from '../support/auth-app.js';
import { cookiePair, socketRequest } from '../support/socket-http.js';
import { runnerRound, removeRunnerRound } from '../support/runner-round.js';

const dir = mkdtempSync(join(tmpdir(), 'varde-admin-bg-')),
  socket = join(dir, 'admin.sock');
const saved = { ...process.env },
  mark = `test.admin-bg.${Date.now()}`,
  ids: string[] = [];
let t: TestApp,
  prisma: PrismaService,
  cookie: string,
  fixture: Awaited<ReturnType<typeof runnerRound>>;
beforeAll(async () => {
  const generated = await breakGlassHash();
  t = await startApp({
    SESSION_SECRET: randomBytes(32).toString('hex'),
    VARDE_BREAK_GLASS_SOCKET: socket,
    VARDE_BREAK_GLASS_OPERATOR: mark,
    VARDE_BREAK_GLASS_UNTIL: new Date(Date.now() + 120_000).toISOString(),
    VARDE_BREAK_GLASS_PASSWORD_HASH: /'(.+)'/.exec(generated.line)![1],
  });
  prisma = t.app.get(PrismaService);
  fixture = await runnerRound(prisma, mark, 'draft');
  ids.push(fixture.round.id);
  cookie = cookiePair(
    (
      await socketRequest(socket, 'POST', '/break-glass/login', {
        json: { password: generated.password },
      })
    ).setCookie,
    '__Host-varde_session',
  );
});
afterAll(async () => {
  for (const id of ids) await removeRunnerRound(prisma, id);
  await prisma.client.delete({ where: { id: fixture.client.id } });
  await prisma.auditLog.deleteMany({ where: { who: `break-glass:${mark}` } });
  await t.app.close();
  rmSync(dir, { recursive: true, force: true });
  process.env = saved;
});
describe('break-glass admin shell and API (1.23)', () => {
  it('socket session reaches metadata APIs; no session is denied; public listener rejects it', async () => {
    for (const path of [
      '/api/admin/clients',
      '/api/admin/rounds',
      '/api/admin/versions',
      '/api/admin/audit',
    ]) {
      expect((await socketRequest(socket, 'GET', path, { cookie })).status).toBe(200);
      expect((await socketRequest(socket, 'GET', path)).status).toBe(401);
      expect(
        (
          await t.app
            .getHttpAdapter()
            .getInstance()
            .inject({ method: 'GET', url: path, headers: { cookie } })
        ).statusCode,
      ).toBe(401);
    }
    const document = await socketRequest(socket, 'GET', '/admin', { cookie });
    expect(document.status).toBe(200);
    expect(document.body).toContain('/admin/assets/');
  });
  it('a lifecycle mutation records the operator rather than the session ID', async () => {
    const created = await socketRequest(socket, 'POST', '/api/admin/rounds', {
      cookie,
      json: { name: mark, template_version_id: fixture.version.id },
    });
    expect(created.status).toBe(201);
    const id = (JSON.parse(created.body) as { id: string }).id;
    ids.push(id);
    expect(
      await prisma.auditLog.findFirst({ where: { what: 'rounds.create', target: `round:${id}` } }),
    ).toMatchObject({ who: `break-glass:${mark}` });
  });
  it('socket SSE uses the main event bus and disconnect frees its connection', async () => {
    await new Promise((r) => setTimeout(r, 350));
    const events = t.app.get(EventsService);
    const req = request({
      socketPath: socket,
      path: '/api/admin/events',
      headers: { cookie },
      agent: false,
    });
    const response = new Promise<import('node:http').IncomingMessage>((resolve) =>
      req.once('response', resolve),
    );
    req.end();
    const stream = await response;
    expect(stream.statusCode).toBe(200);
    let body = '';
    stream.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(events.connections).toBe(1);
    body = '';
    await t.app.get(RoundsService).setDeadline(fixture.rc.id, '2099-07-01', mark);
    await new Promise((r) => setTimeout(r, 350));
    expect(body).toContain('"topic":"rounds"');
    expect(body).toContain('"topic":"progress"');
    req.destroy();
    await new Promise((r) => setTimeout(r, 30));
    expect(events.connections).toBe(0);
  });
});
