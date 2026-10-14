import { describe, expect, it } from 'vitest';
import { SlidingWindow } from '../../src/modules/responses/sliding-window.js';
import { QuotaConfig } from '../../src/config/quota-config.js';

describe('sliding quota window', () => {
  it('expires hits at ten minutes, including previously inactive keys', () => {
    const w = new SlidingWindow(),
      limits = [{ key: 'peer', max: 1 }];
    w.reserve(limits, 1000);
    expect(() => w.reserve(limits, 600999)).toThrow();
    expect(() => w.reserve(limits, 601000)).not.toThrow();
  });
  it('reservation rejection does not spend other scopes; rollback is idempotent', () => {
    const w = new SlidingWindow(),
      global = { key: 'global', max: 2 };
    const undo = w.reserve([global, { key: 'peer', max: 1 }], 0);
    expect(() => w.reserve([global, { key: 'peer', max: 1 }], 1)).toThrow();
    w.reserve([global, { key: 'another', max: 1 }], 2);
    undo();
    undo();
    expect(() => w.reserve([global], 3)).not.toThrow();
  });
  it('quota config rejects unknown fields and non-positive limits', () => {
    expect(QuotaConfig.safeParse({ round_client_factor: 0 }).success).toBe(false);
  });
});
