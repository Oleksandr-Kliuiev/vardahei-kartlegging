import { describe, expect, it } from 'vitest';
import { findBokmal } from '../src/i18n/nn-stoplist.js';
import { SCHEMA_VERSION } from '../src/version.js';

describe('findBokmal', () => {
  it('returns nothing for nynorsk text', () => {
    expect(findBokmal('Eg veit ikkje kva ho meiner, berre spør.')).toEqual([]);
  });

  it('finds bokmål forms on word boundaries', () => {
    expect(findBokmal('Jeg vet ikke hva hun mener, bare spør.')).toEqual([
      'jeg',
      'ikke',
      'hva',
      'hun',
      'bare',
    ]);
  });

  it('does not match inside longer words', () => {
    expect(findBokmal('bleie hunden noensinne')).toEqual([]);
  });
});

describe('SCHEMA_VERSION', () => {
  it('is a semver string', () => {
    expect(SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
