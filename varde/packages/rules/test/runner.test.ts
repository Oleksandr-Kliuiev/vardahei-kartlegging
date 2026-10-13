import { describe, expect, it } from 'vitest';
import { normalizeEmpty } from '../src/runner/index.js';

describe('normalizeEmpty', () => {
  it.each([[undefined], [null], [''], ['   '], [[]]])('maps %j to null', (value) => {
    expect(normalizeEmpty(value)).toBeNull();
  });

  it('keeps real answers', () => {
    expect(normalizeEmpty('ja')).toBe('ja');
    expect(normalizeEmpty(0)).toBe(0);
    expect(normalizeEmpty(['a'])).toEqual(['a']);
  });
});
