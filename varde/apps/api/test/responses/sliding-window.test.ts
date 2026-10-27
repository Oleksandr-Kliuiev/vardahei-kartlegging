import { describe, expect, it } from 'vitest';
import { ipKey, SlidingWindow } from '../../src/modules/responses/sliding-window.js';
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
  it('the committed quota config keeps every window of one link below the global window (1.4)', async () => {
    const { readQuotaConfig } = await import('../../src/config/quota-config.js');
    const c = readQuotaConfig();
    expect(c.per_round_client_per_10min).toBeLessThanOrEqual(c.global_per_10min);
    expect(
      QuotaConfig.safeParse({ ...c, per_round_client_per_10min: c.global_per_10min + 1 }).success,
    ).toBe(false);
    expect(
      QuotaConfig.safeParse({ ...c, seminar_per_seminar_per_10min: c.seminar_global_per_10min + 1 })
        .success,
    ).toBe(false);
    expect(
      QuotaConfig.safeParse({ ...c, live_per_round_client_per_10min: c.live_global_per_10min + 1 })
        .success,
    ).toBe(false);
  });
});

describe('ipKey (1.4)', () => {
  it('IPv4 and IPv4-mapped IPv6 are the IPv4 address', () => {
    expect(ipKey('192.0.2.7')).toBe('192.0.2.7');
    expect(ipKey('::ffff:192.0.2.7')).toBe('192.0.2.7');
    expect(ipKey('::FFFF:c000:207')).toBe('192.0.2.7');
  });
  it('IPv6 is counted by its /64, in any spelling', () => {
    const key = '2001:db8:1:2::/64';
    expect(ipKey('2001:db8:1:2::1')).toBe(key);
    expect(ipKey('2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd')).toBe(key);
    expect(ipKey('2001:DB8:1:2:0:0:0:9%eth0')).toBe(key);
    expect(ipKey('2001:db8:1:3::1')).not.toBe(key);
    expect(ipKey('::1')).toBe('0:0:0:0::/64');
  });
  it('something that is not an address stays as it is', () => {
    expect(ipKey('unknown')).toBe('unknown');
    expect(ipKey('1:2:3')).toBe('1:2:3');
    expect(ipKey('2001:db8::1::2')).toBe('2001:db8::1::2');
  });
});
