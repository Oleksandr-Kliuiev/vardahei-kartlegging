import 'reflect-metadata';
import { EventEmitter } from 'node:events';
import type { FastifyReply } from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';
import type { AdminRequest } from '../../src/modules/auth/admin-session.guard.js';
import type { SessionService } from '../../src/modules/auth/session.service.js';
import { EventsController } from '../../src/modules/events/events.controller.js';
import { EventsService } from '../../src/modules/events/events.service.js';

class Response extends EventEmitter {
  writeHead = vi.fn();
  write = vi.fn(() => true);
  end = vi.fn(() => {
    this.emit('close');
  });
}
afterEach(() => {
  vi.useRealTimers();
});

it('ping is a comment every 25 seconds and a revoked session ends the stream', async () => {
  vi.useFakeTimers();
  const session = { expiresAt: new Date(Date.now() + 120_000) };
  const resolve = vi.fn().mockResolvedValue(session);
  const events = new EventsService(),
    raw = new Response();
  const controller = new EventsController(events, { resolve } as unknown as SessionService);
  controller.stream(
    { adminSession: session } as AdminRequest,
    { hijack: vi.fn(), raw } as unknown as FastifyReply,
  );
  expect(events.connections).toBe(1);
  raw.write.mockClear();
  await vi.advanceTimersByTimeAsync(24_999);
  expect(raw.write).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(raw.write.mock.calls).toEqual([[': ping\n\n']]);
  resolve.mockResolvedValue(null);
  await vi.advanceTimersByTimeAsync(25_000);
  expect(raw.end).toHaveBeenCalledOnce();
  expect(events.connections).toBe(0);
  expect(raw.write).toHaveBeenCalledTimes(1);
  events.onModuleDestroy();
});
