import { describe, expect, it } from 'vitest';
import { metricKey } from '../src/findings/index.js';

describe('metricKey', () => {
  it('joins key and version', () => {
    expect(metricKey('zone', 3)).toBe('zone@3');
  });

  it('rejects invalid input', () => {
    expect(() => metricKey('Zone', 1)).toThrow();
    expect(() => metricKey('zone', 0)).toThrow();
  });
});
