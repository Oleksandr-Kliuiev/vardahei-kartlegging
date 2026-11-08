// Where a login may come back to (concept of Samtalar: back to the same question): a page of the admin
// on this site and nothing else, whatever is put in the link.
import { describe, expect, it } from 'vitest';
import { returnTo } from '../src/modules/auth/return-to.js';

describe('the page a login comes back to', () => {
  it.each([
    '/admin',
    '/admin/',
    '/admin/samtalar',
    '/admin/samtalar/8c41e2d0-1111-4222-8333-123456789abc?q=N26',
    '/admin/samtalar/8c41e2d0-1111-4222-8333-123456789abc/oppsummering',
    '/admin/samtalar/oversikt?runde=abc&pagaande=1',
    '/admin/surveys/funn?rule=F12%3Av1',
  ])('takes %s', (path) => {
    expect(returnTo(path)).toBe(path);
  });

  it.each([
    [undefined],
    [null],
    [1],
    [{}],
    [['/admin']],
    [''],
    ['/'],
    ['/r'],
    ['/auth/login'],
    ['admin'],
    ['/administrator'],
    ['/admin.evil.example'],
    ['//evil.example/admin'],
    ['///evil.example'],
    ['/\\evil.example'],
    ['https://evil.example/admin'],
    ['/admin//evil.example'],
    ['/admin/\\evil.example'],
    ['/admin/../r'],
    ['/admin/..'],
    ['/admin/%2e%2e/r'],
    ['/admin/a.b'],
    ['/admin/samtalar#x'],
    ['/admin?x=1\r\nLocation: https://evil.example'],
    ['/admin\n'],
    ['/admin/\u0000'],
    [`/admin/${'a'.repeat(512)}`],
  ])('refuses %j', (value) => {
    expect(returnTo(value)).toBeNull();
  });

  it('takes the longest page it allows and not one letter more', () => {
    const at = `/admin/${'a'.repeat(505)}`;
    expect(at).toHaveLength(512);
    expect(returnTo(at)).toBe(at);
    expect(returnTo(`${at}a`)).toBeNull();
  });
});
