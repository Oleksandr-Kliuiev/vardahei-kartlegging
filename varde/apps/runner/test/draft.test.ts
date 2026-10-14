import { webcrypto } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmDraft, draftKey, expireCodeDrafts, loadDraft, newDraft, saveDraft, type DraftStorage } from '../src/draft.js';

beforeAll(() => {
  vi.stubGlobal('crypto', webcrypto);
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
  });
});
beforeEach(() => { localStorage.clear(); });
const expires = '2099-06-01T22:00:00Z';
const key = 'varde:0123456789abcdef:v1';
describe('draft contract (1.15)', () => {
  it('key uses first 16 SHA-256 hex characters and version, not the bearer', async () => {
    expect(await draftKey('abc', 'v1')).toBe('varde:ba7816bf8f01cfea:v1');
  });
  it('reload restores answers, free, step, language, start and two independent ids', () => {
    const draft = { ...newDraft('en', expires), answers: { Q1: 'a' }, free: { Q1: 'Syntetisk tekst' }, step: 2 };
    saveDraft(key, draft);
    expect(loadDraft(key, ['nn', 'en'], expires)).toEqual(draft);
    expect(draft.submission_ids.common).not.toBe(draft.submission_ids.leader);
    expect(draft.submission_ids.common).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('another version is removed; other rounds are left alone', () => {
    saveDraft('varde:0123456789abcdef:v0', newDraft('nn', expires));
    saveDraft('varde:fedcba9876543210:v0', newDraft('nn', expires));
    expect(loadDraft(key, ['nn', 'en'], expires)).toBeNull();
    expect(localStorage.getItem('varde:0123456789abcdef:v0')).toBeNull();
    expect(localStorage.getItem('varde:fedcba9876543210:v0')).not.toBeNull();
  });
  it('expired draft is removed and a shortened server deadline cannot be bypassed', () => {
    saveDraft(key, newDraft('nn', '2020-01-01T00:00:00Z'));
    expect(loadDraft(key, ['nn'], expires)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
    saveDraft(key, newDraft('nn', expires));
    expect(loadDraft(key, ['nn'], '2020-01-01T00:00:00Z')).toBeNull();
  });
  it('malformed draft or unavailable language is removed', () => {
    localStorage.setItem(key, '{broken');
    expect(loadDraft(key, ['nn'], expires)).toBeNull();
    saveDraft(key, newDraft('nb', expires));
    expect(loadDraft(key, ['nn', 'en'], expires)).toBeNull();
  });
  it('only both confirmed parts remove the draft; first confirmation persists ids', () => {
    const draft = newDraft('nn', expires);
    saveDraft(key, draft);
    const common = confirmDraft(key, draft, 'common');
    expect(loadDraft(key, ['nn'], expires)?.confirmed).toEqual({ common: true, leader: false });
    expect(common.submission_ids).toEqual(draft.submission_ids);
    confirmDraft(key, common, 'leader');
    expect(localStorage.getItem(key)).toBeNull();
  });
  it('expired server link removes every draft of that code, even without a version', async () => {
    const current = await draftKey('abc', 'v1');
    const old = await draftKey('abc', 'v0');
    saveDraft(current, newDraft('nn', expires));
    saveDraft(old, newDraft('nn', expires));
    saveDraft(key, newDraft('nn', expires));
    await expireCodeDrafts('abc');
    expect(localStorage.getItem(current)).toBeNull();
    expect(localStorage.getItem(old)).toBeNull();
    expect(localStorage.getItem(key)).not.toBeNull();
  });
  it('blocked storage, failed reads/writes/removals do not interrupt the survey', () => {
    const blocked: DraftStorage = { length: 1, key: () => key,
      getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('denied'); },
    };
    expect(() => saveDraft(key, newDraft('nn', expires), blocked)).not.toThrow();
    expect(loadDraft(key, ['nn'], expires, blocked)).toBeNull();
    expect(() => confirmDraft(key, newDraft('nn', expires), 'common', blocked)).not.toThrow();
  });
});
