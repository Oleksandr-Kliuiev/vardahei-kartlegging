// m3 of the 0b review: closing the break-glass app must not disconnect the Prisma client it
// shares with the main app (one pool within the db budget).
import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { breakGlassHash } from '../src/cli.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { socketRequest } from './support/socket-http.js';

const dir = mkdtempSync(join(tmpdir(), 'varde-bgp-'));
const SOCKET = join(dir, 'bg.sock');
const OPERATOR = `prisma-test-${Date.now()}`;
const saved = { ...process.env };
let app: NestFastifyApplication | undefined;

afterAll(async () => {
  await app?.get(PrismaService).auditLog.deleteMany({ where: { who: `break-glass:${OPERATOR}` } });
  await app?.close();
  process.env = { ...saved };
  rmSync(dir, { recursive: true, force: true });
});

describe('break-glass shares the Prisma client of the main app', () => {
  it('after the window closes, the main client still answers', async () => {
    const { line } = await breakGlassHash();
    Object.assign(process.env, {
      SESSION_SECRET: randomBytes(32).toString('hex'),
      VARDE_BREAK_GLASS_SOCKET: SOCKET,
      VARDE_BREAK_GLASS_OPERATOR: OPERATOR,
      VARDE_BREAK_GLASS_UNTIL: new Date(Date.now() + 1500).toISOString(),
      VARDE_BREAK_GLASS_PASSWORD_HASH: /'(.+)'/.exec(line)?.[1] ?? '',
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app);
    await app.init();
    const fastify = app.getHttpAdapter().getInstance();
    await fastify.ready();
    const viaSocket = await socketRequest(SOCKET, 'GET', '/health');
    expect(viaSocket.status).toBe(200);
    // Prisma reconnects lazily, so "still answers" alone would not show a dropped pool.
    const disconnect = vi.spyOn(app.get(PrismaService), '$disconnect');
    await new Promise((r) => setTimeout(r, 2200));
    expect(existsSync(SOCKET)).toBe(false);
    const prisma = app.get(PrismaService);
    expect(
      await prisma.auditLog.count({
        where: { who: `break-glass:${OPERATOR}`, what: 'break_glass.closed' },
      }),
    ).toBe(1);
    expect(disconnect).not.toHaveBeenCalled();
    expect((await fastify.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });
});
