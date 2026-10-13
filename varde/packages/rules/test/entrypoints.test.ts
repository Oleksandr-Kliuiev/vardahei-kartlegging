import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

describe('@varde/rules entry points', () => {
  it('resolves @varde/rules/runner', async () => {
    const mod = await import('@varde/rules/runner');
    expect(typeof mod.normalizeEmpty).toBe('function');
  });

  it('resolves @varde/rules/findings', async () => {
    const mod = await import('@varde/rules/findings');
    expect(typeof mod.metricKey).toBe('function');
  });

  it('has no root export (no barrel)', () => {
    const require = createRequire(import.meta.url);
    let code: unknown;
    try {
      require.resolve('@varde/rules');
    } catch (error) {
      code = (error as NodeJS.ErrnoException).code;
    }
    expect(code).toBe('ERR_PACKAGE_PATH_NOT_EXPORTED');
  });
});
