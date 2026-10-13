import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { bootstrap, createApp, DEFAULT_PORT, resolvePort } from '../src/bootstrap.js';

describe('bootstrap', () => {
  it('calls listen with host 0.0.0.0 and PORT', async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    await bootstrap(() => Promise.resolve({ listen }), { PORT: '3123' });
    expect(listen).toHaveBeenCalledWith(3123, '0.0.0.0');
  });

  it('defaults to port 3000', async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    await bootstrap(() => Promise.resolve({ listen }), {});
    expect(listen).toHaveBeenCalledWith(DEFAULT_PORT, '0.0.0.0');
    expect(DEFAULT_PORT).toBe(3000);
  });

  it('rejects an invalid PORT', () => {
    expect(() => resolvePort({ PORT: 'abc' })).toThrow();
  });

  it('really binds 0.0.0.0', async () => {
    const app = await bootstrap(createApp, { PORT: '0' });
    const address = app.getHttpServer().address() as AddressInfo;
    expect(address.address).toBe('0.0.0.0');
    await app.close();
  });
});
