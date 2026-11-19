// admin_k (19.11): the admin views of an open round show every answer; k stays for clients.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPrivacyConfig } from '../../src/config/privacy-config.js';

const config = (json: object) => {
  const dir = mkdtempSync(join(tmpdir(), 'varde-privacy-'));
  writeFileSync(join(dir, 'privacy.json'), JSON.stringify(json));
  return readPrivacyConfig({ VARDE_CONFIG_DIR: dir });
};

describe('privacy.json admin_k', () => {
  it('the repository config keeps k = 3 for clients and shows every answer to admins', () => {
    const c = readPrivacyConfig({});
    expect(c.k).toBe(3);
    expect(c.admin_k).toBe(1);
  });

  it('is k when absent, and only 1..k', () => {
    expect(config({ k: 3 }).admin_k).toBe(3);
    expect(() => config({ k: 3, admin_k: 0 })).toThrow(/admin_k/);
    expect(() => config({ k: 3, admin_k: 4 })).toThrow(/admin_k/);
    expect(() => config({ k: 3, admin_k: 1.5 })).toThrow(/admin_k/);
  });
});
