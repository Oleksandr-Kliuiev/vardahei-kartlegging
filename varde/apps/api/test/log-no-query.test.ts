// Task 0.6: the request log has method, path without query and status; runner paths only on
// status ≥ 400; no IP; the exception filter does not write the query either.
import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/bootstrap.js';
import { captureOutput, type Captured } from './support/capture-output.js';

const SECRET = 'SECRETCODE123';
let app: NestFastifyApplication;
let out: Captured;

beforeAll(async () => {
  out = captureOutput();
  app = await createApp();
  const fastify = app.getHttpAdapter().getInstance();
  fastify.get('/r/x', () => ({ ok: true }));
  fastify.get('/api/runner/boom', () => {
    throw new Error(`boom at /api/runner/boom?c=${SECRET}`);
  });
  await app.init();
  await fastify.ready();
});

afterAll(async () => {
  await app.close();
  out.restore();
});

function requestLines(path: string): Record<string, unknown>[] {
  return out
    .lines()
    .filter((l) => l.startsWith('{'))
    .map((l) => JSON.parse(l) as Record<string, unknown>)
    .filter((l) => l.path === path);
}

const get = (url: string) => app.getHttpAdapter().getInstance().inject({ method: 'GET', url });

describe('request log without query (0.6)', () => {
  it('runner path 200 → no log line at all', async () => {
    const res = await get(`/r/x?c=${SECRET}`);
    expect(res.statusCode).toBe(200);
    expect(requestLines('/r/x')).toEqual([]);
  });

  it('runner path 404 → a line without the code, the response without it too', async () => {
    const res = await get(`/r/missing?c=${SECRET}`);
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain(SECRET);
    const [line] = requestLines('/r/missing');
    expect(line).toMatchObject({ method: 'GET', path: '/r/missing', status: 404 });
    expect(Object.keys(line ?? {}).sort()).toEqual(['at', 'method', 'ms', 'path', 'status']);
  });

  it('/auth/callback?code=… → a line without the code', async () => {
    await get(`/auth/callback?code=${SECRET}&state=abc`);
    expect(requestLines('/auth/callback')).toHaveLength(1);
  });

  it('5xx on a runner path: logged, no query in the log or the response', async () => {
    const res = await get(`/api/runner/boom?c=${SECRET}`);
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain(SECRET);
    expect(requestLines('/api/runner/boom')).toHaveLength(1);
  });

  it('nothing written anywhere contains the code or an IP', () => {
    expect(out.text()).not.toContain(SECRET);
    expect(out.text()).not.toMatch(/127\.0\.0\.1|remoteAddress|"ip"/);
  });
});
