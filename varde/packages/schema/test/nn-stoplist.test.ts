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
      'vet',
      'ikke',
      'hva',
      'hun',
      'mener',
      'bare',
    ]);
  });

  it('finds the forms added for the eval of survey drafts (0.14)', () => {
    expect(findBokmal('Hvor mye bruker du hjemme? Hvis noe skjer, hva gjør dere?')).toEqual([
      'hvor',
      'mye',
      'bruker',
      'hjemme',
      'hvis',
      'noe',
      'hva',
      'gjør',
      'dere',
    ]);
    expect(findBokmal('Kvar brukar du mykje tid heime? Viss noko skjer, kva gjer de?')).toEqual([]);
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
