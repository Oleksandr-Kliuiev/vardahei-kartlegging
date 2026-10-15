import { act } from 'preact/test-utils';
import { render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '../src/app.js';
import { defaultLanguage } from '../src/i18n/ui.js';

const root = document.createElement('div');
afterEach(() => { render(null, root); vi.unstubAllGlobals(); });
describe('runner skeleton (1.12)', () => {
  it('loads the bearer from the link, displays server error without a code', async () => {
    history.replaceState(null, '', '/r?c=synthetic-link');
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 403, json: () => Promise.resolve({ message: 'Lenkja er ikkje gyldig.' }) });
    vi.stubGlobal('fetch', fetcher);
    void act(() => { mount(root); });
    expect(fetcher).toHaveBeenCalledWith('/api/runner/round', expect.objectContaining({ headers: { Authorization: 'Bearer synthetic-link' } }));
    await vi.waitFor(() => expect(root.querySelector('h1')?.textContent).toBe('Denne lenkja verkar ikkje'));
    expect(root.textContent).not.toContain('synthetic-link');
  });
  it('closed round → closed screen', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 410, json: () => Promise.resolve({}) }));
    void act(() => { mount(root); });
    await vi.waitFor(() => expect(root.querySelector('h1')?.textContent).toBe('Kartlegginga er avslutta'));
  });
  it('client default language must belong to the version', () => {
    expect(defaultLanguage(['nn', 'en'], 'en')).toBe('en');
    expect(defaultLanguage(['nn', 'en'], 'nb')).toBe('nn');
  });
});
