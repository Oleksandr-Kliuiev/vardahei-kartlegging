import { describe, expect, it } from 'vitest';
import { reminderText } from '../src/round-client.js';
import { versionText } from '../src/models.js';

describe('reminder text', () => {
  it('names the deadline and ends with the link, in nynorsk and English', () => {
    const nn = reminderText('nn', 'https://x.test/r?c=1', '2026-06-01');
    expect(nn).toContain('Hugs å svare på undersøkinga innan');
    expect(nn.endsWith('https://x.test/r?c=1')).toBe(true);
    const en = reminderText('en', 'https://x.test/r?c=1', '2026-06-01');
    expect(en).toContain('A reminder to answer the survey before');
    expect(reminderText('nn', 'https://x.test/r', null)).not.toContain('innan');
  });
});

describe('version text', () => {
  it('shows the product name, question count and publish date', () => {
    const text = versionText({
      id: 'v',
      label: '2026-10-13',
      template: { key: 'tryggleik' },
      question_count: 16,
      published_at: '2026-10-13T08:00:00.000Z',
    });
    expect(text).toContain('IT-tryggleik · 2026-10-13');
    expect(text).toContain('16 spørsmål');
    expect(text).toContain('publisert');
  });
  it('still works when the API sends no extra facts', () => {
    expect(versionText({ id: 'v', label: 'x', template: { key: 'ki' } })).toBe(
      'KI i kvardagen · x',
    );
  });
});
