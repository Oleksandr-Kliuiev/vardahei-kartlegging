import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const docsVarde = fileURLToPath(new URL('../../../../docs/varde/', import.meta.url));

describe('docs/varde', () => {
  it('exists next to varde/', () => {
    expect(existsSync(`${docsVarde}PRINCIPLES.md`)).toBe(true);
  });
});
